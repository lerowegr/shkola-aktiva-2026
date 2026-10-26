import { randomUUID } from "node:crypto";

import { fullName } from "~~/lib/applications/staff";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { FACULTIES } from "~~/lib/profile/onboarding";

import {
  lockAssessmentCapacity,
  usedAssessmentPlaces,
  type AssessmentTx,
} from "./capacity";
import {
  dayOf,
  invitesFaculty,
  placeChanged,
  placeLine,
  placeOf,
  placeProblem,
  readPlace,
  type AssessmentAnswerKind,
  type Place,
} from "./rules";

/**
 * Сборы центра оценки: день, общая аудитория, факультеты — и приглашения.
 *
 * Сбор видят кандидаты: где и когда собираются все. Подгруппы внутри сбора —
 * только организаторы и эксперты (lib/assessment/groups.ts). Приглашение одно
 * на анкету; «свой день» кандидата вычисляется (rules.ts → dayOf): ответ
 * «резервный день» переносит его на резервный сбор сезона.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const TITLE_MAX = 80;
const FIELD_MAX = 120;
const NOTE_MAX = 500;
/** Напоминание неответившим — не чаще раза в час (двойной клик, нервы). */
const REMIND_EVERY_MS = 60 * 60 * 1000;

export interface SessionInput {
  id?: string;
  title: string;
  building: string;
  room: string;
  startsAt: string;
  note: string;
  faculties: string[];
  reserve: boolean;
  capacity?: number;
}

function when(date: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(date));
}

export async function reserveOf(seasonId: string) {
  return db.assessmentSession.findFirst({
    where: { seasonId, reserve: true },
    select: {
      id: true,
      title: true,
      building: true,
      room: true,
      startsAt: true,
      note: true,
      invited: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Сборы
// ---------------------------------------------------------------------------

export async function saveSession(
  seasonId: string,
  input: SessionInput,
): Promise<Result<{ id: string; created: boolean }>> {
  const title = input.title.trim();
  if (!title)
    return {
      ok: false,
      message: "Назовите сбор — например, «Понедельник: СНиМК и МЭО».",
    };
  if (title.length > TITLE_MAX)
    return { ok: false, message: `Название — до ${TITLE_MAX} знаков.` };
  if (input.building.length > FIELD_MAX || input.room.length > FIELD_MAX) {
    return {
      ok: false,
      message: `Корпус и аудитория — до ${FIELD_MAX} знаков.`,
    };
  }
  if (input.note.length > NOTE_MAX)
    return { ok: false, message: `Заметка — до ${NOTE_MAX} знаков.` };
  if (
    input.capacity !== undefined &&
    (!Number.isInteger(input.capacity) ||
      input.capacity < 1 ||
      input.capacity > 10_000)
  ) {
    return {
      ok: false,
      message: "Лимит приглашений — целое число от 1 до 10 000.",
    };
  }
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime()))
    return { ok: false, message: "Укажите дату и время сбора." };

  const faculties = [
    ...new Set(
      input.faculties.filter((faculty) =>
        (FACULTIES as readonly string[]).includes(faculty),
      ),
    ),
  ];
  if (!input.reserve && faculties.length === 0)
    return {
      ok: false,
      message: "Отметьте факультеты, которых приглашаете на этот сбор.",
    };

  return db.$transaction(async (tx) => {
    await lockAssessmentCapacity(tx, seasonId);
    if (input.reserve) {
      const other = await tx.assessmentSession.findFirst({
        where: {
          seasonId,
          reserve: true,
          ...(input.id ? { id: { not: input.id } } : {}),
        },
        select: { title: true },
      });
      if (other)
        return {
          ok: false,
          message: `Резервный день уже есть — «${other.title}». Он один на сезон.`,
        };
    }

    const data = {
      title,
      building: input.building.trim() || null,
      room: input.room.trim() || null,
      startsAt,
      note: input.note.trim() || null,
      faculties: input.reserve ? [] : faculties,
      reserve: input.reserve,
    };

    if (input.id) {
      const found = await tx.assessmentSession.findFirst({
        where: { id: input.id, seasonId },
        select: { id: true, seasonId: true, reserve: true, capacity: true },
      });
      if (!found)
        return { ok: false, message: "Сбор не найден — обновите страницу." };
      const capacity = input.capacity ?? found.capacity;
      const used = await usedAssessmentPlaces(tx, {
        ...found,
        reserve: found.reserve || input.reserve,
      });
      if (capacity < used)
        return {
          ok: false,
          message: `Уже приглашено ${used}. Лимит нельзя уменьшить ниже этого числа.`,
        };
      await tx.assessmentSession.update({
        where: { id: found.id },
        data: { ...data, capacity },
      });
      return { ok: true, id: found.id, created: false };
    }
    const capacity = input.capacity ?? 50;
    if (input.reserve) {
      const moved = await tx.assessmentInvite.count({
        where: {
          answer: "RESERVE",
          reserveQueued: false,
          session: { seasonId },
        },
      });
      if (capacity < moved)
        return {
          ok: false,
          message: `В резервный день уже перешли ${moved}. Лимит нельзя установить ниже этого числа.`,
        };
    }
    const created = await tx.assessmentSession.create({
      data: { ...data, seasonId, capacity },
      select: { id: true },
    });
    return { ok: true, id: created.id, created: true };
  });
}

/** Удалить сбор — с его подгруппами и приглашениями. Пустые заготовки оценок уходят, начатые остаются. */
export async function deleteSession(
  seasonId: string,
  sessionId: string,
): Promise<Result<{ title: string; invites: number; groups: number }>> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: {
      id: true,
      title: true,
      _count: { select: { invites: true } },
      groups: {
        select: {
          experts: { select: { userId: true } },
          members: { select: { applicationId: true } },
        },
      },
    },
  });
  if (!session)
    return { ok: false, message: "Сбор не найден — обновите страницу." };

  const pairs = session.groups.flatMap((group) =>
    group.members.map((member) => ({
      applicationId: member.applicationId,
      experts: group.experts.map((expert) => expert.userId),
    })),
  );
  await db.$transaction([
    ...pairs.map((pair) =>
      db.review.deleteMany({
        where: {
          applicationId: pair.applicationId,
          stageKind: "ASSESSMENT",
          reviewerId: { in: pair.experts },
          scores: { none: {} },
          markers: { none: {} },
          OR: [{ comment: null }, { comment: "" }],
        },
      }),
    ),
    // Подгруппы, участники и приглашения уходят каскадом.
    db.assessmentSession.delete({ where: { id: session.id } }),
  ]);
  return {
    ok: true,
    title: session.title,
    invites: session._count.invites,
    groups: session.groups.length,
  };
}

// ---------------------------------------------------------------------------
// Приглашения
// ---------------------------------------------------------------------------

function inviteText(place: Place, reserve: { startsAt: Date | string } | null) {
  const lines = [`${when(place.startsAt!)} (МСК), ${placeLine(place)}.`];
  if (place.note) lines.push(place.note);
  lines.push(
    reserve
      ? `Ответьте в кабинете: «Буду», «Приду в резервный день» (очередь ожидания отдельного приглашения) или «Не получится». Резервный сбор запланирован на ${when(reserve.startsAt)}.`
      : "Ответьте в кабинете: «Буду», «Приду в резервный день» (очередь ожидания отдельного приглашения) или «Не получится».",
  );
  return lines.join("\n");
}

const MSK_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" });
const MSK_TIME = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
const MSK_DATE = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long" });

/**
 * Все будущие обычные сборы того же дня (по Москве), что и этот, с общими
 * факультетами — время на выбор. Один — выбирать не из чего.
 */
async function dayTimes(sessionId: string, now = new Date()): Promise<Date[]> {
  const session = await db.assessmentSession.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, startsAt: true, faculties: true, reserve: true },
  });
  if (!session || session.reserve) return [];
  const day = MSK_DAY.format(session.startsAt);
  const siblings = await db.assessmentSession.findMany({
    where: { seasonId: session.seasonId, reserve: false, startsAt: { gt: now }, faculties: { hasSome: session.faculties } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  return siblings.map((item) => item.startsAt).filter((date) => MSK_DAY.format(date) === day);
}

/** Приглашение, когда в этот день несколько времён: выбрать в кабинете, сколько мест — не говорим. */
function chooseText(place: Place, times: Date[]) {
  const lines = [
    `${MSK_DATE.format(times[0]!)} — центр оценки, ${placeLine(place)}.`,
    `Время на выбор: ${times.map((time) => MSK_TIME.format(time)).join(", ")} (МСК). Места ограничены — кто раньше выбрал, за тем и место.`,
  ];
  if (place.note) lines.push(place.note);
  lines.push("Выберите время в кабинете. Если ни одно не подходит — «Приду в резервный день» или «Не получится».");
  return lines.join("\n");
}

/** Одинаковое приглашение при ручной рассылке и при поздней отправке анкеты. */
async function notifyInvites(
  invites: { id: string; application: { userId: string } }[],
  place: Place,
  reserve: { startsAt: Date | string } | null,
  sessionId?: string,
) {
  const times = sessionId ? await dayTimes(sessionId) : [];
  const choose = times.length > 1;
  await notify(
    invites.map((invite) => ({
      userId: invite.application.userId,
      category: "SELECTION" as const,
      title: choose ? "Центр оценки — выберите время" : "Приглашение на центр оценки — будете?",
      body: choose ? chooseText(place, times) : inviteText(place, reserve),
      url: "/cabinet/assessment",
      key: `assessment-invite:${invite.id}`,
    })),
    { urgent: true },
  );
}

type InvitePerson = { id: string; userId: string };
type CapacitySession = {
  id: string;
  seasonId: string;
  capacity: number;
  reserve: boolean;
  faculties: string[];
  building: string | null;
  room: string | null;
  startsAt: Date;
  note: string | null;
  invited: unknown;
  invitedAt: Date | null;
};
type InviteBatch = {
  sessionId: string;
  reserve: boolean;
  place: Place;
  invites: { id: string; application: { userId: string } }[];
};
const capacitySessionSelect = {
  id: true,
  seasonId: true,
  capacity: true,
  reserve: true,
  faculties: true,
  building: true,
  room: true,
  startsAt: true,
  note: true,
  invited: true,
  invitedAt: true,
} as const;

/** Вызывается под замком сезона; снимок публикуется при первом приглашении. */
async function claimInvites(
  tx: AssessmentTx,
  session: CapacitySession,
  people: InvitePerson[],
  now: Date,
): Promise<InviteBatch | null> {
  const place = readPlace(session.invited) ?? placeOf(session);
  if (placeProblem(place)) return null;
  const free = Math.max(
    0,
    session.capacity - (await usedAssessmentPlaces(tx, session)),
  );
  const selected = people.slice(0, free);
  if (!selected.length) return null;
  const created = await tx.assessmentInvite.createManyAndReturn({
    data: selected.map((item) => ({
      sessionId: session.id,
      applicationId: item.id,
      invitedAt: now,
    })),
    skipDuplicates: true,
    select: { id: true, applicationId: true },
  });
  if (!created.length) return null;
  if (!session.invitedAt || !readPlace(session.invited)) {
    await tx.assessmentSession.update({
      where: { id: session.id },
      data: { invited: { ...place }, invitedAt: now },
    });
  }
  const users = new Map(selected.map((item) => [item.id, item.userId]));
  return {
    sessionId: session.id,
    reserve: session.reserve,
    place,
    invites: created.map((invite) => ({
      id: invite.id,
      application: { userId: users.get(invite.applicationId)! },
    })),
  };
}

/** Поздняя анкета занимает ближайшее свободное место после начала рассылки факультета. */
export async function autoInvite(
  applicationId: string,
  now = new Date(),
): Promise<boolean> {
  try {
    const application = await db.application.findFirst({
      where: {
        id: applicationId,
        status: "SUBMITTED",
        season: { isCurrent: true },
        user: { status: "ACTIVE" },
      },
      select: {
        id: true,
        userId: true,
        seasonId: true,
        user: { select: { faculty: true } },
        assessmentInvite: { select: { id: true } },
      },
    });
    if (!application?.user.faculty || application.assessmentInvite)
      return false;
    const batch = await db.$transaction(
      async (tx) => {
        await lockAssessmentCapacity(tx, application.seasonId);
        if (
          await tx.assessmentInvite.findUnique({
            where: { applicationId },
            select: { id: true },
          })
        )
          return null;
        const sessions = (
          await tx.assessmentSession.findMany({
            where: { seasonId: application.seasonId, reserve: false },
            orderBy: [{ startsAt: "asc" }, { id: "asc" }],
            select: capacitySessionSelect,
          })
        ).filter((item) => invitesFaculty(item, application.user.faculty));
        // Первую рассылку запускает организатор; следующие созданные слоты
        // могут начать принимать переполнение без отдельного нажатия кнопки.
        const firstStarted = sessions.find((item) => item.invitedAt !== null);
        if (!firstStarted) return null;
        for (const session of sessions) {
          if (
            session.startsAt <= now ||
            session.startsAt < firstStarted.startsAt
          )
            continue;
          const claimed = await claimInvites(tx, session, [application], now);
          if (claimed) return claimed;
        }
        return null;
      },
      { timeout: 30_000 },
    );
    if (!batch) return false;
    await notifyInvites(
      batch.invites,
      batch.place,
      await reserveOf(application.seasonId),
      batch.sessionId,
    );
    return true;
  } catch (error) {
    console.error("Не удалось автоматически пригласить на центр оценки", error);
    return false;
  }
}

/** Заполняем выбранный слот, затем следующие подходящие. Выданные приглашения не переносим. */
export async function inviteSession(
  seasonId: string,
  sessionId: string,
  applicationIds?: string[],
): Promise<
  Result<{
    invited: number;
    skipped: number;
    unplaced: number;
    overflow: number;
  }>
> {
  const outcome = await db.$transaction(
    async (tx) => {
      await lockAssessmentCapacity(tx, seasonId);
      const session = await tx.assessmentSession.findFirst({
        where: { id: sessionId, seasonId },
        select: capacitySessionSelect,
      });
      if (!session)
        return {
          ok: false as const,
          message: "Сбор не найден — обновите страницу.",
        };
      const place = placeOf(session);
      if (placeChanged(readPlace(session.invited), place)) {
        return {
          ok: false as const,
          message:
            "Место или время сбора изменились после приглашения — сначала нажмите «Сообщить об изменении», потом приглашайте новых.",
        };
      }
      const problem = placeProblem(place);
      if (problem) return { ok: false as const, message: problem };
      const candidates = await tx.application.findMany({
        where: {
          seasonId,
          status: "SUBMITTED",
          user: { status: "ACTIVE" },
          ...(applicationIds ? { id: { in: applicationIds } } : {}),
        },
        orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          userId: true,
          user: { select: { faculty: true } },
          assessmentInvite: { select: { id: true } },
        },
      });
      const wanted = applicationIds
        ? candidates
        : candidates.filter((item) =>
            invitesFaculty(session, item.user.faculty),
          );
      let remaining = wanted.filter((item) => !item.assessmentInvite);
      const skipped = wanted.length - remaining.length;
      const now = new Date();
      const following = session.reserve
        ? []
        : await tx.assessmentSession.findMany({
            where: {
              seasonId,
              reserve: false,
              startsAt: {
                gt: new Date(
                  Math.max(now.getTime(), session.startsAt.getTime()),
                ),
              },
            },
            orderBy: [{ startsAt: "asc" }, { id: "asc" }],
            select: capacitySessionSelect,
          });
      const batches: InviteBatch[] = [];
      for (const slot of [session, ...following]) {
        if (!remaining.length) break;
        const eligible =
          slot.id === session.id
            ? remaining
            : remaining.filter((item) =>
                invitesFaculty(slot, item.user.faculty),
              );
        const batch = await claimInvites(tx, slot, eligible, now);
        if (!batch) continue;
        batches.push(batch);
        const invitedUsers = new Set(
          batch.invites.map((invite) => invite.application.userId),
        );
        remaining = remaining.filter((item) => !invitedUsers.has(item.userId));
      }
      return {
        ok: true as const,
        batches,
        skipped,
        unplaced: remaining.length,
      };
    },
    { timeout: 30_000 },
  );
  if (!outcome.ok) return outcome;
  const reserve = await reserveOf(seasonId);
  for (const batch of outcome.batches)
    await notifyInvites(
      batch.invites,
      batch.place,
      batch.reserve ? null : reserve,
      batch.sessionId,
    );
  return {
    ok: true,
    invited: outcome.batches.reduce(
      (count, batch) => count + batch.invites.length,
      0,
    ),
    skipped: outcome.skipped,
    unplaced: outcome.unplaced,
    overflow: outcome.batches
      .filter((batch) => batch.sessionId !== sessionId)
      .reduce((count, batch) => count + batch.invites.length, 0),
  };
}

/** Отдельная рассылка ожидающим: создание резервного сбора само по себе никого не записывает. */
export async function inviteReserveQueue(
  seasonId: string,
  now = new Date(),
): Promise<Result<{ invited: number; waiting: number; sessionId: string }>> {
  const outcome = await db.$transaction(
    async (tx) => {
      await lockAssessmentCapacity(tx, seasonId);
      const session = await tx.assessmentSession.findFirst({
        where: { seasonId, reserve: true },
        select: capacitySessionSelect,
      });
      if (!session)
        return {
          ok: false as const,
          message:
            "Сначала создайте сбор с галочкой «Резервный день». Очередь сохранена.",
        };
      if (session.startsAt <= now)
        return {
          ok: false as const,
          message:
            "Резервный сбор уже начался. Укажите будущую дату перед рассылкой.",
        };
      const place = placeOf(session);
      const problem = placeProblem(place);
      if (problem) return { ok: false as const, message: problem };
      if (placeChanged(readPlace(session.invited), place))
        return {
          ok: false as const,
          message:
            "Место или время изменились — сначала нажмите «Сообщить об изменении». Очередь сохранена.",
        };
      const where = {
        answer: "RESERVE" as const,
        reserveQueued: true,
        session: { seasonId },
        application: {
          status: "SUBMITTED" as const,
          user: { status: "ACTIVE" as const },
        },
      };
      const waiting = await tx.assessmentInvite.count({ where });
      const free = Math.max(
        0,
        session.capacity - (await usedAssessmentPlaces(tx, session)),
      );
      const selected = free
        ? await tx.assessmentInvite.findMany({
            where,
            orderBy: [{ answeredAt: "asc" }, { id: "asc" }],
            take: free,
            select: { id: true, application: { select: { userId: true } } },
          })
        : [];
      if (selected.length) {
        await tx.assessmentInvite.updateMany({
          where: { id: { in: selected.map((item) => item.id) } },
          data: { reserveQueued: false },
        });
        if (!session.invitedAt || !readPlace(session.invited))
          await tx.assessmentSession.update({
            where: { id: session.id },
            data: { invited: { ...place }, invitedAt: now },
          });
      }
      return {
        ok: true as const,
        selected,
        place,
        sessionId: session.id,
        waiting: waiting - selected.length,
      };
    },
    { timeout: 30_000 },
  );
  if (!outcome.ok) return outcome;
  const batchKey = randomUUID();
  await notify(
    outcome.selected.map((item) => ({
      userId: item.application.userId,
      category: "SELECTION" as const,
      title: "Приглашение на резервный день центра оценки",
      body: [
        `Вы приглашены из очереди: ${when(outcome.place.startsAt!)} (МСК), ${placeLine(outcome.place)}.`,
        outcome.place.note,
        "Место за вами закреплено. Подробности — в кабинете.",
      ]
        .filter(Boolean)
        .join("\n"),
      url: "/cabinet/assessment",
      key: `assessment-reserve-invite:${item.id}:${batchKey}`,
    })),
    { urgent: true },
  );
  return {
    ok: true,
    invited: outcome.selected.length,
    waiting: outcome.waiting,
    sessionId: outcome.sessionId,
  };
}

/** Напомнить тем, кто не ответил. */
export async function remindSession(
  seasonId: string,
  sessionId: string,
  now = new Date(),
): Promise<Result<{ reminded: number }>> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: {
      id: true,
      building: true,
      room: true,
      startsAt: true,
      note: true,
      reserve: true,
      invited: true,
    },
  });
  if (!session)
    return { ok: false, message: "Сбор не найден — обновите страницу." };

  const silent = await db.assessmentInvite.findMany({
    where: {
      sessionId: session.id,
      answer: null,
      OR: [
        { remindedAt: null },
        { remindedAt: { lt: new Date(now.getTime() - REMIND_EVERY_MS) } },
      ],
    },
    select: { id: true, application: { select: { userId: true } } },
  });
  if (silent.length === 0)
    return {
      ok: false,
      message:
        "Напоминать некому: все ответили или напоминание уже было в последний час.",
    };

  await db.assessmentInvite.updateMany({
    where: { id: { in: silent.map((invite) => invite.id) } },
    data: { remindedAt: now },
  });
  const place = readPlace(session.invited) ?? placeOf(session);
  const reserve = session.reserve ? null : await reserveOf(seasonId);
  await notify(
    silent.map((invite) => ({
      userId: invite.application.userId,
      category: "SELECTION" as const,
      title: "Ответьте на приглашение на центр оценки",
      body: inviteText(place, reserve),
      url: "/cabinet/assessment",
      key: `assessment-remind:${invite.id}:${now.getTime()}`,
    })),
  );
  return { ok: true, reminded: silent.length };
}

/** Кто сейчас идёт на этот сбор: приглашены на него (кроме «резерв» и «не смогу») и, если он резервный, — ответившие «резервный день». */
async function attendeesOf(
  seasonId: string,
  session: { id: string; reserve: boolean },
) {
  const reserve = session.reserve
    ? session.id
    : ((await reserveOf(seasonId))?.id ?? null);
  const invites = await db.assessmentInvite.findMany({
    where: session.reserve
      ? {
          OR: [{ sessionId: session.id }, { answer: "RESERVE" }],
          session: { seasonId },
        }
      : { sessionId: session.id },
    select: {
      id: true,
      sessionId: true,
      answer: true,
      reserveQueued: true,
      attended: true,
      applicationId: true,
      application: { select: { userId: true } },
    },
  });
  return invites.filter((invite) => dayOf(invite, reserve) === session.id);
}

/** Место или время изменились — сообщить всем, чей день этот сбор. */
export async function notifyChange(
  seasonId: string,
  sessionId: string,
): Promise<Result<{ sent: number }>> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: {
      id: true,
      building: true,
      room: true,
      startsAt: true,
      note: true,
      reserve: true,
      invited: true,
    },
  });
  if (!session)
    return { ok: false, message: "Сбор не найден — обновите страницу." };
  const place = placeOf(session);
  const problem = placeProblem(place);
  if (problem) return { ok: false, message: problem };
  if (!placeChanged(readPlace(session.invited), place))
    return {
      ok: false,
      message: "Место и время не менялись с приглашения — сообщать нечего.",
    };

  const now = new Date();
  await db.assessmentSession.update({
    where: { id: session.id },
    data: { invited: { ...place }, invitedAt: now },
  });
  const people = await attendeesOf(seasonId, session);
  await notify(
    people.map((invite) => ({
      userId: invite.application.userId,
      category: "SELECTION" as const,
      title: "Центр оценки: изменилось место или время",
      body: [`${when(place.startsAt!)} (МСК), ${placeLine(place)}.`, place.note]
        .filter(Boolean)
        .join("\n"),
      url: "/cabinet/assessment",
      key: `assessment-change:${session.id}:${now.getTime()}:${invite.id}`,
    })),
    { urgent: true },
  );
  return { ok: true, sent: people.length };
}

/** Отметка «пришёл» — по приглашению кандидата. */
export async function setAttended(
  seasonId: string,
  applicationId: string,
  attended: boolean,
): Promise<Result> {
  const { count } = await db.assessmentInvite.updateMany({
    where: { applicationId, session: { seasonId } },
    data: { attended },
  });
  if (count === 0)
    return {
      ok: false,
      message:
        "Кандидат не приглашён на центр оценки — сначала пригласите его.",
    };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Чтение: обзор и страница сбора
// ---------------------------------------------------------------------------

export interface SessionCounts {
  invited: number;
  going: number;
  reserve: number;
  cant: number;
  silent: number;
}

export interface SessionRow {
  id: string;
  title: string;
  building: string | null;
  room: string | null;
  startsAt: Date;
  note: string | null;
  faculties: string[];
  reserve: boolean;
  capacity: number;
  occupied: number;
  invitedAt: Date | null;
  /** Место изменилось после приглашения — сообщите снова. */
  stale: boolean;
  counts: SessionCounts;
  groups: {
    id: string;
    title: string;
    experts: { id: string; name: string }[];
    members: number;
    done: number;
  }[];
}

export interface AssessmentOverview {
  sessions: SessionRow[];
  reserveQueue: {
    applicationId: string;
    name: string;
    faculty: string | null;
    queuedAt: Date | null;
  }[];
  /** Отправили анкету, но ни на один сбор не приглашены. */
  notInvited: number;
  /** Из них — без факультета: в рассылку по факультетам не попадут. */
  noFaculty: number;
  hasReserve: boolean;
}

const groupSelect = {
  id: true,
  title: true,
  experts: {
    select: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          telegramUsername: true,
        },
      },
    },
  },
  members: {
    select: {
      applicationId: true,
      application: {
        select: {
          reviews: {
            where: { stageKind: "ASSESSMENT" as const },
            select: { reviewerId: true, _count: { select: { scores: true } } },
          },
        },
      },
    },
  },
} as const;

function groupSummary(
  group: {
    id: string;
    title: string;
    experts: {
      user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        telegramUsername: string | null;
      };
    }[];
    members: {
      applicationId: string;
      application: {
        reviews: { reviewerId: string; _count: { scores: number } }[];
      };
    }[];
  },
  criteria: number,
) {
  const experts = group.experts.map((expert) => expert.user.id);
  const done = group.members.filter((member) => {
    const relevant = member.application.reviews.filter((review) =>
      experts.includes(review.reviewerId),
    );
    return (
      relevant.length > 0 &&
      criteria > 0 &&
      relevant.every((review) => review._count.scores >= criteria)
    );
  }).length;
  return {
    id: group.id,
    title: group.title,
    experts: group.experts
      .map((expert) => ({ id: expert.user.id, name: displayName(expert.user) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    members: group.members.length,
    done,
  };
}

/** Все сборы сезона со счётчиками; эксперту без права распределять — только сборы с его подгруппами и только они. */
export async function loadOverview(
  seasonId: string,
  onlyExpert?: string,
): Promise<AssessmentOverview> {
  const [sessions, criteria, invites] = await Promise.all([
    db.assessmentSession.findMany({
      where: {
        seasonId,
        ...(onlyExpert
          ? { groups: { some: { experts: { some: { userId: onlyExpert } } } } }
          : {}),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        building: true,
        room: true,
        startsAt: true,
        note: true,
        faculties: true,
        reserve: true,
        capacity: true,
        invited: true,
        invitedAt: true,
        groups: {
          where: onlyExpert
            ? { experts: { some: { userId: onlyExpert } } }
            : {},
          orderBy: { createdAt: "asc" },
          select: groupSelect,
        },
      },
    }),
    db.criterion.count({ where: { seasonId, stageKind: "ASSESSMENT" } }),
    db.assessmentInvite.findMany({
      where: { session: { seasonId } },
      select: { sessionId: true, answer: true, reserveQueued: true },
    }),
  ]);
  const reserveId =
    sessions.find((session) => session.reserve)?.id ??
    (await reserveOf(seasonId))?.id ??
    null;

  const rows: SessionRow[] = sessions.map((session) => {
    const own = invites.filter((invite) => invite.sessionId === session.id);
    const movedHere = session.reserve
      ? invites.filter(
          (invite) =>
            invite.sessionId !== session.id &&
            invite.answer === "RESERVE" &&
            !invite.reserveQueued,
        ).length
      : 0;
    const counts: SessionCounts = {
      invited: own.length,
      going:
        own.filter((invite) => invite.answer === "GOING").length + movedHere,
      reserve: own.filter((invite) => invite.answer === "RESERVE").length,
      cant: own.filter((invite) => invite.answer === "CANT").length,
      silent: own.filter((invite) => invite.answer === null).length,
    };
    return {
      id: session.id,
      title: session.title,
      building: session.building,
      room: session.room,
      startsAt: session.startsAt,
      note: session.note,
      faculties: session.faculties,
      reserve: session.reserve,
      capacity: session.capacity,
      occupied: own.length + movedHere,
      invitedAt: session.invitedAt,
      stale: placeChanged(readPlace(session.invited), placeOf(session)),
      counts,
      groups: session.groups.map((group) => groupSummary(group, criteria)),
    };
  });

  if (onlyExpert)
    return {
      sessions: rows,
      reserveQueue: [],
      notInvited: 0,
      noFaculty: 0,
      hasReserve: reserveId !== null,
    };

  const queued = await db.assessmentInvite.findMany({
    where: {
      answer: "RESERVE",
      reserveQueued: true,
      session: { seasonId },
      application: { status: "SUBMITTED", user: { status: "ACTIVE" } },
    },
    orderBy: [{ answeredAt: "asc" }, { id: "asc" }],
    select: {
      answeredAt: true,
      application: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          user: { select: { faculty: true } },
        },
      },
    },
  });

  const free = await db.application.findMany({
    where: { seasonId, status: "SUBMITTED", assessmentInvite: null },
    select: { user: { select: { faculty: true } } },
  });
  return {
    sessions: rows,
    reserveQueue: queued.map((item) => ({
      applicationId: item.application.id,
      name: fullName(item.application),
      faculty: item.application.user.faculty,
      queuedAt: item.answeredAt,
    })),
    notInvited: free.length,
    noFaculty: free.filter((item) => !item.user.faculty).length,
    hasReserve: reserveId !== null,
  };
}

export interface SessionPerson {
  applicationId: string;
  name: string;
  faculty: string | null;
  answer: AssessmentAnswerKind | null;
  attended: boolean;
  groupId: string | null;
}

export interface SessionPage {
  session: Omit<SessionRow, "groups">;
  /** Ответы на приглашение именно на этот сбор. */
  answers: Record<"going" | "reserve" | "cant" | "silent", SessionPerson[]>;
  /** Чей день — этот сбор (включая перешедших на резервный), по подгруппам и нераспределённые. */
  groups: (SessionRow["groups"][number] & { people: SessionPerson[] })[];
  unassigned: SessionPerson[];
  /** Не приглашённые никуда и без факультета — пригласить вручную (только организатору). */
  noFaculty: { applicationId: string; name: string }[];
}

export async function loadSessionPage(
  seasonId: string,
  sessionId: string,
  manage: boolean,
): Promise<SessionPage | null> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: {
      id: true,
      title: true,
      building: true,
      room: true,
      startsAt: true,
      note: true,
      faculties: true,
      reserve: true,
      capacity: true,
      invited: true,
      invitedAt: true,
      groups: { orderBy: { createdAt: "asc" }, select: groupSelect },
    },
  });
  if (!session) return null;
  const reserveId = session.reserve
    ? session.id
    : ((await reserveOf(seasonId))?.id ?? null);
  const criteria = await db.criterion.count({
    where: { seasonId, stageKind: "ASSESSMENT" },
  });

  const invites = await db.assessmentInvite.findMany({
    where: session.reserve
      ? {
          OR: [{ sessionId: session.id }, { answer: "RESERVE" }],
          session: { seasonId },
        }
      : { sessionId: session.id },
    select: {
      sessionId: true,
      answer: true,
      reserveQueued: true,
      attended: true,
      application: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          middleName: true,
          user: { select: { faculty: true } },
          assessment: { select: { groupId: true } },
        },
      },
    },
  });
  const groupIds = new Set(session.groups.map((group) => group.id));
  const person = (invite: (typeof invites)[number]): SessionPerson => {
    const groupId = invite.application.assessment?.groupId ?? null;
    return {
      applicationId: invite.application.id,
      name: fullName(invite.application),
      faculty: invite.application.user.faculty,
      answer: invite.answer,
      attended: invite.attended,
      groupId: groupId && groupIds.has(groupId) ? groupId : null,
    };
  };
  const byName = (a: SessionPerson, b: SessionPerson) =>
    a.name.localeCompare(b.name, "ru");

  const own = invites
    .filter((invite) => invite.sessionId === session.id)
    .map(person);
  const answers = {
    going: own.filter((item) => item.answer === "GOING").sort(byName),
    reserve: own.filter((item) => item.answer === "RESERVE").sort(byName),
    cant: own.filter((item) => item.answer === "CANT").sort(byName),
    silent: own.filter((item) => item.answer === null).sort(byName),
  };
  // Чей день — этот сбор; «не смогу», но всё же пришедший и уже в подгруппе — тоже.
  const day = invites
    .filter(
      (invite) =>
        dayOf(invite, reserveId) === session.id ||
        (invite.answer === "CANT" &&
          invite.sessionId === session.id &&
          groupIds.has(invite.application.assessment?.groupId ?? "")),
    )
    .map(person);

  const groups = session.groups.map((group) => ({
    ...groupSummary(group, criteria),
    people: day.filter((item) => item.groupId === group.id).sort(byName),
  }));
  // Нераспределённые: сначала пришедшие, потом «буду», потом молчащие.
  const rank = (item: SessionPerson) =>
    item.attended
      ? 0
      : item.answer === "GOING" || item.answer === "RESERVE"
        ? 1
        : 2;
  const unassigned = day
    .filter((item) => !item.groupId)
    .sort((a, b) => rank(a) - rank(b) || byName(a, b));

  const noFaculty = manage
    ? (
        await db.application.findMany({
          where: {
            seasonId,
            status: "SUBMITTED",
            assessmentInvite: null,
            user: { faculty: null },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            lastName: true,
            firstName: true,
            middleName: true,
          },
        })
      ).map((application) => ({
        applicationId: application.id,
        name: fullName(application),
      }))
    : [];

  const movedHere = session.reserve
    ? invites.filter(
        (invite) =>
          invite.sessionId !== session.id &&
          invite.answer === "RESERVE" &&
          !invite.reserveQueued,
      ).length
    : 0;
  return {
    session: {
      id: session.id,
      title: session.title,
      building: session.building,
      room: session.room,
      startsAt: session.startsAt,
      note: session.note,
      faculties: session.faculties,
      reserve: session.reserve,
      capacity: session.capacity,
      occupied: own.length + movedHere,
      invitedAt: session.invitedAt,
      stale: placeChanged(readPlace(session.invited), placeOf(session)),
      counts: {
        invited: own.length,
        going: answers.going.length + movedHere,
        reserve: answers.reserve.length,
        cant: answers.cant.length,
        silent: answers.silent.length,
      },
    },
    answers,
    groups,
    unassigned,
    noFaculty,
  };
}
