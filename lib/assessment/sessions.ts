import { fullName } from "~~/lib/applications/staff";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { FACULTIES } from "~~/lib/profile/onboarding";

import { dayOf, invitesFaculty, placeChanged, placeLine, placeOf, placeProblem, readPlace, type AssessmentAnswerKind, type Place } from "./rules";

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
    select: { id: true, title: true, building: true, room: true, startsAt: true, note: true, invited: true },
  });
}

// ---------------------------------------------------------------------------
// Сборы
// ---------------------------------------------------------------------------

export async function saveSession(seasonId: string, input: SessionInput): Promise<Result<{ id: string; created: boolean }>> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Назовите сбор — например, «Понедельник: СНиМК и МЭО»." };
  if (title.length > TITLE_MAX) return { ok: false, message: `Название — до ${TITLE_MAX} знаков.` };
  if (input.building.length > FIELD_MAX || input.room.length > FIELD_MAX) {
    return { ok: false, message: `Корпус и аудитория — до ${FIELD_MAX} знаков.` };
  }
  if (input.note.length > NOTE_MAX) return { ok: false, message: `Заметка — до ${NOTE_MAX} знаков.` };
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: "Укажите дату и время сбора." };

  const faculties = [...new Set(input.faculties.filter((faculty) => (FACULTIES as readonly string[]).includes(faculty)))];
  if (!input.reserve && faculties.length === 0) return { ok: false, message: "Отметьте факультеты, которых приглашаете на этот сбор." };

  if (input.reserve) {
    const other = await db.assessmentSession.findFirst({
      where: { seasonId, reserve: true, ...(input.id ? { id: { not: input.id } } : {}) },
      select: { title: true },
    });
    if (other) return { ok: false, message: `Резервный день уже есть — «${other.title}». Он один на сезон.` };
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
    const found = await db.assessmentSession.findFirst({ where: { id: input.id, seasonId }, select: { id: true } });
    if (!found) return { ok: false, message: "Сбор не найден — обновите страницу." };
    await db.assessmentSession.update({ where: { id: found.id }, data });
    return { ok: true, id: found.id, created: false };
  }
  const created = await db.assessmentSession.create({ data: { ...data, seasonId }, select: { id: true } });
  return { ok: true, id: created.id, created: true };
}

/** Удалить сбор — с его подгруппами и приглашениями. Пустые заготовки оценок уходят, начатые остаются. */
export async function deleteSession(seasonId: string, sessionId: string): Promise<Result<{ title: string; invites: number; groups: number }>> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: {
      id: true,
      title: true,
      _count: { select: { invites: true } },
      groups: { select: { experts: { select: { userId: true } }, members: { select: { applicationId: true } } } },
    },
  });
  if (!session) return { ok: false, message: "Сбор не найден — обновите страницу." };

  const pairs = session.groups.flatMap((group) =>
    group.members.map((member) => ({ applicationId: member.applicationId, experts: group.experts.map((expert) => expert.userId) })),
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
  return { ok: true, title: session.title, invites: session._count.invites, groups: session.groups.length };
}

// ---------------------------------------------------------------------------
// Приглашения
// ---------------------------------------------------------------------------

function inviteText(place: Place, reserve: { startsAt: Date | string } | null) {
  const lines = [`${when(place.startsAt!)} (МСК), ${placeLine(place)}.`];
  if (place.note) lines.push(place.note);
  lines.push(
    reserve
      ? `Ответьте в кабинете: «Буду», «Приду в резервный день» (${when(reserve.startsAt)}) или «Не получится».`
      : "Ответьте в кабинете: «Буду» или «Не получится».",
  );
  return lines.join("\n");
}

/**
 * Пригласить на сбор. Без списка — всех с отправленной анкетой нужных
 * факультетов, кого ещё ни на один сбор не приглашали. Со списком — этих
 * (например, без факультета), тоже только ещё не приглашённых.
 */
export async function inviteSession(
  seasonId: string,
  sessionId: string,
  applicationIds?: string[],
): Promise<Result<{ invited: number; skipped: number }>> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: { id: true, title: true, building: true, room: true, startsAt: true, note: true, faculties: true, reserve: true, invited: true },
  });
  if (!session) return { ok: false, message: "Сбор не найден — обновите страницу." };
  const place = placeOf(session);
  const problem = placeProblem(place);
  if (problem) return { ok: false, message: problem };

  const candidates = await db.application.findMany({
    where: {
      seasonId,
      status: "SUBMITTED",
      user: { status: "ACTIVE" },
      ...(applicationIds ? { id: { in: applicationIds } } : {}),
    },
    select: { id: true, userId: true, user: { select: { faculty: true } }, assessmentInvite: { select: { id: true } } },
  });
  const wanted = applicationIds ? candidates : candidates.filter((item) => invitesFaculty(session, item.user.faculty));
  const fresh = wanted.filter((item) => !item.assessmentInvite);
  const skipped = wanted.length - fresh.length;
  if (fresh.length === 0) {
    return { ok: true, invited: 0, skipped };
  }

  const now = new Date();
  await db.$transaction([
    db.assessmentInvite.createMany({ data: fresh.map((item) => ({ sessionId: session.id, applicationId: item.id, invitedAt: now })), skipDuplicates: true }),
    db.assessmentSession.update({ where: { id: session.id }, data: { invited: { ...place }, invitedAt: now } }),
  ]);
  const reserve = session.reserve ? null : await reserveOf(seasonId);
  const invites = await db.assessmentInvite.findMany({
    where: { sessionId: session.id, applicationId: { in: fresh.map((item) => item.id) } },
    select: { id: true, application: { select: { userId: true } } },
  });
  await notify(
    invites.map((invite) => ({
      userId: invite.application.userId,
      category: "SELECTION" as const,
      title: "Приглашение на центр оценки — будете?",
      body: inviteText(place, reserve),
      url: "/cabinet/assessment",
      key: `assessment-invite:${invite.id}`,
    })),
  );
  return { ok: true, invited: invites.length, skipped };
}

/** Напомнить тем, кто не ответил. */
export async function remindSession(seasonId: string, sessionId: string, now = new Date()): Promise<Result<{ reminded: number }>> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: { id: true, building: true, room: true, startsAt: true, note: true, reserve: true, invited: true },
  });
  if (!session) return { ok: false, message: "Сбор не найден — обновите страницу." };

  const silent = await db.assessmentInvite.findMany({
    where: {
      sessionId: session.id,
      answer: null,
      OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(now.getTime() - REMIND_EVERY_MS) } }],
    },
    select: { id: true, application: { select: { userId: true } } },
  });
  if (silent.length === 0) return { ok: false, message: "Напоминать некому: все ответили или напоминание уже было в последний час." };

  await db.assessmentInvite.updateMany({ where: { id: { in: silent.map((invite) => invite.id) } }, data: { remindedAt: now } });
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
async function attendeesOf(seasonId: string, session: { id: string; reserve: boolean }) {
  const reserve = session.reserve ? session.id : (await reserveOf(seasonId))?.id ?? null;
  const invites = await db.assessmentInvite.findMany({
    where: session.reserve ? { OR: [{ sessionId: session.id }, { answer: "RESERVE" }], session: { seasonId } } : { sessionId: session.id },
    select: { id: true, sessionId: true, answer: true, attended: true, applicationId: true, application: { select: { userId: true } } },
  });
  return invites.filter((invite) => dayOf(invite, reserve) === session.id);
}

/** Место или время изменились — сообщить всем, чей день этот сбор. */
export async function notifyChange(seasonId: string, sessionId: string): Promise<Result<{ sent: number }>> {
  const session = await db.assessmentSession.findFirst({
    where: { id: sessionId, seasonId },
    select: { id: true, building: true, room: true, startsAt: true, note: true, reserve: true, invited: true },
  });
  if (!session) return { ok: false, message: "Сбор не найден — обновите страницу." };
  const place = placeOf(session);
  const problem = placeProblem(place);
  if (problem) return { ok: false, message: problem };
  if (!placeChanged(readPlace(session.invited), place)) return { ok: false, message: "Место и время не менялись с приглашения — сообщать нечего." };

  const now = new Date();
  await db.assessmentSession.update({ where: { id: session.id }, data: { invited: { ...place }, invitedAt: now } });
  const people = await attendeesOf(seasonId, session);
  await notify(
    people.map((invite) => ({
      userId: invite.application.userId,
      category: "SELECTION" as const,
      title: "Центр оценки: изменилось место или время",
      body: [`${when(place.startsAt!)} (МСК), ${placeLine(place)}.`, place.note].filter(Boolean).join("\n"),
      url: "/cabinet/assessment",
      key: `assessment-change:${session.id}:${now.getTime()}:${invite.id}`,
    })),
  );
  return { ok: true, sent: people.length };
}

/** Отметка «пришёл» — по приглашению кандидата. */
export async function setAttended(seasonId: string, applicationId: string, attended: boolean): Promise<Result> {
  const { count } = await db.assessmentInvite.updateMany({
    where: { applicationId, session: { seasonId } },
    data: { attended },
  });
  if (count === 0) return { ok: false, message: "Кандидат не приглашён на центр оценки — сначала пригласите его." };
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
  invitedAt: Date | null;
  /** Место изменилось после приглашения — сообщите снова. */
  stale: boolean;
  counts: SessionCounts;
  groups: { id: string; title: string; experts: { id: string; name: string }[]; members: number; done: number }[];
}

export interface AssessmentOverview {
  sessions: SessionRow[];
  /** Отправили анкету, но ни на один сбор не приглашены. */
  notInvited: number;
  /** Из них — без факультета: в рассылку по факультетам не попадут. */
  noFaculty: number;
  hasReserve: boolean;
}

const groupSelect = {
  id: true,
  title: true,
  experts: { select: { user: { select: { id: true, firstName: true, lastName: true, email: true, telegramUsername: true } } } },
  members: {
    select: {
      applicationId: true,
      application: { select: { reviews: { where: { stageKind: "ASSESSMENT" as const }, select: { reviewerId: true, _count: { select: { scores: true } } } } } },
    },
  },
} as const;

function groupSummary(
  group: {
    id: string;
    title: string;
    experts: { user: { id: string; firstName: string | null; lastName: string | null; email: string | null; telegramUsername: string | null } }[];
    members: { applicationId: string; application: { reviews: { reviewerId: string; _count: { scores: number } }[] } }[];
  },
  criteria: number,
) {
  const experts = group.experts.map((expert) => expert.user.id);
  const done = group.members.filter((member) => {
    const relevant = member.application.reviews.filter((review) => experts.includes(review.reviewerId));
    return relevant.length > 0 && criteria > 0 && relevant.every((review) => review._count.scores >= criteria);
  }).length;
  return {
    id: group.id,
    title: group.title,
    experts: group.experts.map((expert) => ({ id: expert.user.id, name: displayName(expert.user) })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    members: group.members.length,
    done,
  };
}

/** Все сборы сезона со счётчиками; эксперту без права распределять — только сборы с его подгруппами и только они. */
export async function loadOverview(seasonId: string, onlyExpert?: string): Promise<AssessmentOverview> {
  const [sessions, criteria, invites] = await Promise.all([
    db.assessmentSession.findMany({
      where: { seasonId, ...(onlyExpert ? { groups: { some: { experts: { some: { userId: onlyExpert } } } } } : {}) },
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
        invited: true,
        invitedAt: true,
        groups: {
          where: onlyExpert ? { experts: { some: { userId: onlyExpert } } } : {},
          orderBy: { createdAt: "asc" },
          select: groupSelect,
        },
      },
    }),
    db.criterion.count({ where: { seasonId, stageKind: "ASSESSMENT" } }),
    db.assessmentInvite.findMany({ where: { session: { seasonId } }, select: { sessionId: true, answer: true } }),
  ]);
  const reserveId = sessions.find((session) => session.reserve)?.id ?? (await reserveOf(seasonId))?.id ?? null;

  const rows: SessionRow[] = sessions.map((session) => {
    const own = invites.filter((invite) => invite.sessionId === session.id);
    const movedHere = session.reserve ? invites.filter((invite) => invite.sessionId !== session.id && invite.answer === "RESERVE").length : 0;
    const counts: SessionCounts = {
      invited: own.length,
      going: own.filter((invite) => invite.answer === "GOING").length + movedHere,
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
      invitedAt: session.invitedAt,
      stale: placeChanged(readPlace(session.invited), placeOf(session)),
      counts,
      groups: session.groups.map((group) => groupSummary(group, criteria)),
    };
  });

  if (onlyExpert) return { sessions: rows, notInvited: 0, noFaculty: 0, hasReserve: reserveId !== null };

  const free = await db.application.findMany({
    where: { seasonId, status: "SUBMITTED", assessmentInvite: null },
    select: { user: { select: { faculty: true } } },
  });
  return {
    sessions: rows,
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

export async function loadSessionPage(seasonId: string, sessionId: string, manage: boolean): Promise<SessionPage | null> {
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
      invited: true,
      invitedAt: true,
      groups: { orderBy: { createdAt: "asc" }, select: groupSelect },
    },
  });
  if (!session) return null;
  const reserveId = session.reserve ? session.id : (await reserveOf(seasonId))?.id ?? null;
  const criteria = await db.criterion.count({ where: { seasonId, stageKind: "ASSESSMENT" } });

  const invites = await db.assessmentInvite.findMany({
    where: session.reserve ? { OR: [{ sessionId: session.id }, { answer: "RESERVE" }], session: { seasonId } } : { sessionId: session.id },
    select: {
      sessionId: true,
      answer: true,
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
  const byName = (a: SessionPerson, b: SessionPerson) => a.name.localeCompare(b.name, "ru");

  const own = invites.filter((invite) => invite.sessionId === session.id).map(person);
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
        (invite.answer === "CANT" && invite.sessionId === session.id && groupIds.has(invite.application.assessment?.groupId ?? "")),
    )
    .map(person);

  const groups = session.groups.map((group) => ({
    ...groupSummary(group, criteria),
    people: day.filter((item) => item.groupId === group.id).sort(byName),
  }));
  // Нераспределённые: сначала пришедшие, потом «буду», потом молчащие.
  const rank = (item: SessionPerson) => (item.attended ? 0 : item.answer === "GOING" || item.answer === "RESERVE" ? 1 : 2);
  const unassigned = day.filter((item) => !item.groupId).sort((a, b) => rank(a) - rank(b) || byName(a, b));

  const noFaculty = manage
    ? (
        await db.application.findMany({
          where: { seasonId, status: "SUBMITTED", assessmentInvite: null, user: { faculty: null } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, lastName: true, firstName: true, middleName: true },
        })
      ).map((application) => ({ applicationId: application.id, name: fullName(application) }))
    : [];

  const movedHere = session.reserve ? invites.filter((invite) => invite.sessionId !== session.id && invite.answer === "RESERVE").length : 0;
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
