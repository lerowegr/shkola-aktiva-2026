import { db } from "~~/lib/db";
import { stageState, type StageState } from "~~/lib/stages";

import { lockAssessmentCapacity } from "./capacity";
import {
  canChangeAnswer,
  dayOf,
  placeOf,
  readPlace,
  type AssessmentAnswerKind,
  type Place,
} from "./rules";

/**
 * Центр оценки глазами кандидата: что это за этап, приглашение на сбор и
 * ответ — «буду», «резервный день», «не смогу».
 *
 * Только сбор — место и время, где собираются все. Подгрупп, экспертов,
 * баллов и комментариев этот файл не читает вовсе: так их точно не утащить
 * в ответ кабинета. Место — снимок при приглашении (или последнем «сообщить
 * об изменении»): правка без рассылки кандидату не видна.
 */
export interface CandidateDay extends Place {
  title: string;
  reserve: boolean;
}

/** Другое время того же дня для своего факультета — кандидат выбирает сам. */
export interface CandidateSlot extends CandidateDay {
  id: string;
  /** Сбор, на который сейчас приглашён. */
  current: boolean;
  /** Свободных мест; у своего сбора не важно. */
  free: number;
}

export interface CandidateAssessment {
  title: string;
  description: string | null;
  state: StageState;
  opensAt: Date | null;
  closesAt: Date | null;
  invite: {
    answer: AssessmentAnswerKind | null;
    reserveQueued: boolean;
    /** Сбор, на который пригласили. */
    session: CandidateDay;
    /** Резервный день сезона, если задан. */
    reserve: CandidateDay | null;
    /** Куда идти по ответу: сбор, резервный день или никуда («не смогу»). */
    day: CandidateDay | null;
    canChange: boolean;
    /** Время на выбор: свой сбор и другие сборы этого дня для факультета, где есть места. */
    slots: CandidateSlot[];
  } | null;
}

type SessionLike = {
  id: string;
  title: string;
  reserve: boolean;
  building: string | null;
  room: string | null;
  startsAt: Date;
  note: string | null;
  invited: unknown;
};

function asDay(session: SessionLike): CandidateDay {
  const place = readPlace(session.invited) ?? placeOf(session);
  return { ...place, title: session.title, reserve: session.reserve };
}

const sessionSelect = {
  id: true,
  title: true,
  reserve: true,
  capacity: true,
  building: true,
  room: true,
  startsAt: true,
  note: true,
  invited: true,
} as const;

type Client = Pick<typeof db, "application" | "assessmentSession" | "assessmentInvite">;

async function context(userId: string, client: Client = db) {
  return client.application.findFirst({
    where: { userId, status: "SUBMITTED", season: { isCurrent: true } },
    select: {
      id: true,
      seasonId: true,
      user: { select: { faculty: true } },
      season: {
        select: {
          stages: {
            where: { kind: "ASSESSMENT" },
            select: {
              title: true,
              description: true,
              mode: true,
              opensAt: true,
              closesAt: true,
            },
          },
          assessmentSessions: {
            where: { reserve: true },
            select: sessionSelect,
            take: 1,
          },
        },
      },
      assessmentInvite: {
        select: {
          id: true,
          sessionId: true,
          answer: true,
          reserveQueued: true,
          session: { select: sessionSelect },
        },
      },
    },
  });
}

const MSK_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" });
const mskDay = (date: Date) => MSK_DAY.format(date);
const MSK_TIME = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });

/**
 * Сборы, между которыми кандидат может выбрать время: того же дня (по
 * Москве), что и его приглашение, для его факультета, ещё не начавшиеся.
 * Чужие — только со свободными местами. Место занимает тот, кто ответил
 * «буду» или ещё молчит; «не смогу» и «резервный день» место освобождают.
 */
async function slotsFor(
  client: Client,
  application: NonNullable<Awaited<ReturnType<typeof context>>>,
  now: Date,
): Promise<CandidateSlot[]> {
  const invite = application.assessmentInvite;
  const faculty = application.user.faculty;
  if (!invite || invite.session.reserve || !faculty) return [];
  const day = mskDay(invite.session.startsAt);
  const sessions = (
    await client.assessmentSession.findMany({
      where: {
        seasonId: application.seasonId,
        reserve: false,
        startsAt: { gt: now },
        OR: [{ id: invite.sessionId }, { faculties: { has: faculty } }],
      },
      orderBy: { startsAt: "asc" },
      select: sessionSelect,
    })
  ).filter((session) => mskDay(session.startsAt) === day);
  const taken = await client.assessmentInvite.groupBy({
    by: ["sessionId"],
    where: { sessionId: { in: sessions.map((session) => session.id) }, OR: [{ answer: null }, { answer: "GOING" }] },
    _count: { _all: true },
  });
  const used = new Map(taken.map((row) => [row.sessionId, row._count._all]));
  return sessions
    .map((session) => {
      const current = session.id === invite.sessionId;
      // Свой сбор: себя из занятых не вычитаем дважды.
      const mine = current && (invite.answer === null || invite.answer === "GOING") ? 1 : 0;
      return { ...asDay(session), id: session.id, current, free: session.capacity - (used.get(session.id) ?? 0) + mine };
    })
    .filter((slot) => slot.current || slot.free > 0);
}

export async function loadCandidateAssessment(
  userId: string,
  now = new Date(),
): Promise<CandidateAssessment | null> {
  const application = await context(userId);
  const stage = application?.season.stages[0];
  if (!application || !stage) return null;

  const invite = application.assessmentInvite;
  const reserveSession = application.season.assessmentSessions[0] ?? null;
  let view: CandidateAssessment["invite"] = null;
  if (invite) {
    const session = asDay(invite.session);
    const reserve =
      reserveSession && reserveSession.id !== invite.sessionId
        ? asDay(reserveSession)
        : null;
    const dayId = dayOf(invite, reserveSession?.id ?? null);
    const day =
      dayId === invite.sessionId ? session : dayId && reserve ? reserve : null;
    view = {
      answer: invite.answer,
      reserveQueued: invite.reserveQueued,
      session,
      reserve,
      day,
      canChange: canChangeAnswer(
        now,
        invite.reserveQueued || invite.answer === "CANT"
          ? null
          : invite.answer === "RESERVE"
            ? reserveSession?.startsAt
            : invite.session.startsAt,
      ),
      slots: await slotsFor(db, application, now),
    };
  }

  return {
    title: stage.title,
    description: stage.description?.trim() || null,
    state: stageState(stage, now),
    opensAt: stage.opensAt,
    closesAt: stage.closesAt,
    invite: view,
  };
}

export type AnswerResult =
  { ok: true; message: string } | { ok: false; message: string };

const DONE: Record<AssessmentAnswerKind, string> = {
  GOING: "Ждём вас на центре оценки!",
  RESERVE:
    "Вы в очереди на резервный день. Дату, время и место пришлём отдельным уведомлением.",
  CANT: "Понятно. Организаторы с вами свяжутся.",
};

/**
 * Выбрать другое время того же дня для своего факультета — это ответ «буду»
 * на другой сбор. Под общим замком: места не уходят двоим.
 */
export async function chooseSlot(userId: string, sessionId: string, now = new Date()): Promise<AnswerResult & { movedFrom?: string }> {
  const initial = await context(userId);
  if (!initial?.assessmentInvite) return { ok: false, message: "Приглашения на центр оценки пока нет — пришлём уведомление." };
  if (initial.assessmentInvite.sessionId === sessionId) return answerInvite(userId, "GOING", now);

  return db.$transaction(async (tx) => {
    await lockAssessmentCapacity(tx, initial.seasonId);
    const application = await context(userId, tx);
    const invite = application?.assessmentInvite;
    if (!application || !invite) return { ok: false, message: "Приглашения на центр оценки пока нет — пришлём уведомление." };

    // Уйти со своего сбора можно, пока он не начался (после «не смогу» или из очереди — всегда).
    const current = invite.reserveQueued || invite.answer === "CANT" || invite.answer === "RESERVE" ? null : invite.session.startsAt;
    if (!canChangeAnswer(now, current)) {
      return { ok: false, message: "Ваш центр оценки уже начался — поменять время можно только через организаторов в «Сообщениях»." };
    }
    const slot = (await slotsFor(tx, application, now)).find((item) => item.id === sessionId && !item.current);
    if (!slot) return { ok: false, message: "На это время мест уже нет или оно уже началось — выберите другое." };

    await tx.assessmentInvite.update({
      where: { id: invite.id },
      data: { sessionId, answer: "GOING", reserveQueued: false, answeredAt: now, attended: false },
    });
    const time = slot.startsAt ? ` на ${MSK_TIME.format(new Date(slot.startsAt))} МСК` : "";
    return { ok: true, message: `Записали вас${time}. Ждём!`, movedFrom: invite.sessionId };
  });
}

/** Ответить на приглашение или поменять ответ, пока дни не начались. */
export async function answerInvite(
  userId: string,
  answer: AssessmentAnswerKind,
  now = new Date(),
): Promise<AnswerResult> {
  const initial = await context(userId);
  if (!initial)
    return {
      ok: false,
      message: "Приглашения на центр оценки пока нет — пришлём уведомление.",
    };
  return db.$transaction(async (tx) => {
    await lockAssessmentCapacity(tx, initial.seasonId);
    const application = await context(userId, tx);
    const invite = application?.assessmentInvite;
    if (!application || !invite)
      return {
        ok: false,
        message: "Приглашения на центр оценки пока нет — пришлём уведомление.",
      };

    const reserve = application.season.assessmentSessions[0] ?? null;
    if (answer === "RESERVE" && invite.session.reserve) {
      return {
        ok: false,
        message:
          "Вы уже приглашены на резервный день. Выберите «Буду» или «Не получится».",
      };
    }
    // Менять можно, пока не начался ни нынешний «свой день», ни тот, куда переходим.
    const current =
      invite.reserveQueued || invite.answer === "CANT"
        ? null
        : invite.answer === "RESERVE"
          ? reserve?.startsAt
          : invite.session.startsAt;
    const next = answer === "GOING" ? invite.session.startsAt : null;
    if (!canChangeAnswer(now, current, next)) {
      return {
        ok: false,
        message:
          "Центр оценки уже начался — поменять ответ можно только через организаторов в «Сообщениях».",
      };
    }
    if (invite.answer === answer)
      return {
        ok: true,
        message:
          answer === "RESERVE" && !invite.reserveQueued
            ? "Ждём вас в резервный день."
            : DONE[answer],
      };

    await tx.assessmentInvite.update({
      where: { id: invite.id },
      data: { answer, reserveQueued: answer === "RESERVE", answeredAt: now },
    });
    return { ok: true, message: DONE[answer] };
  });
}
