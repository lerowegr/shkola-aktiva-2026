import { db } from "~~/lib/db";
import { stageState, type StageState } from "~~/lib/stages";

import { lockAssessmentCapacity, usedAssessmentPlaces } from "./capacity";
import { canChangeAnswer, dayOf, placeOf, readPlace, type AssessmentAnswerKind, type Place } from "./rules";

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

export interface CandidateAssessment {
  title: string;
  description: string | null;
  state: StageState;
  opensAt: Date | null;
  closesAt: Date | null;
  invite: {
    answer: AssessmentAnswerKind | null;
    /** Сбор, на который пригласили. */
    session: CandidateDay;
    /** Резервный день сезона, если задан. */
    reserve: CandidateDay | null;
    /** Куда идти по ответу: сбор, резервный день или никуда («не смогу»). */
    day: CandidateDay | null;
    canChange: boolean;
  } | null;
}

type SessionLike = { id: string; title: string; reserve: boolean; building: string | null; room: string | null; startsAt: Date; note: string | null; invited: unknown };

function asDay(session: SessionLike): CandidateDay {
  const place = readPlace(session.invited) ?? placeOf(session);
  return { ...place, title: session.title, reserve: session.reserve };
}

const sessionSelect = { id: true, title: true, reserve: true, capacity: true, building: true, room: true, startsAt: true, note: true, invited: true } as const;

async function context(userId: string, client: Pick<typeof db, "application"> = db) {
  return client.application.findFirst({
    where: { userId, status: "SUBMITTED", season: { isCurrent: true } },
    select: {
      id: true,
      seasonId: true,
      season: {
        select: {
          stages: { where: { kind: "ASSESSMENT" }, select: { title: true, description: true, mode: true, opensAt: true, closesAt: true } },
          assessmentSessions: { where: { reserve: true }, select: sessionSelect, take: 1 },
        },
      },
      assessmentInvite: { select: { id: true, sessionId: true, answer: true, session: { select: sessionSelect } } },
    },
  });
}

export async function loadCandidateAssessment(userId: string, now = new Date()): Promise<CandidateAssessment | null> {
  const application = await context(userId);
  const stage = application?.season.stages[0];
  if (!application || !stage) return null;

  const invite = application.assessmentInvite;
  const reserveSession = application.season.assessmentSessions[0] ?? null;
  let view: CandidateAssessment["invite"] = null;
  if (invite) {
    const session = asDay(invite.session);
    const reserve = reserveSession && reserveSession.id !== invite.sessionId ? asDay(reserveSession) : null;
    const dayId = dayOf(invite, reserveSession?.id ?? null);
    const day = dayId === invite.sessionId ? session : dayId && reserve ? reserve : null;
    view = {
      answer: invite.answer,
      session,
      reserve,
      day,
      canChange: canChangeAnswer(now, invite.session.startsAt, invite.answer === "RESERVE" ? reserveSession?.startsAt : null),
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

export type AnswerResult = { ok: true; message: string } | { ok: false; message: string };

const DONE: Record<AssessmentAnswerKind, string> = {
  GOING: "Ждём вас на центре оценки!",
  RESERVE: "Ждём вас в резервный день.",
  CANT: "Понятно. Организаторы с вами свяжутся.",
};

/** Ответить на приглашение или поменять ответ, пока дни не начались. */
export async function answerInvite(userId: string, answer: AssessmentAnswerKind, now = new Date()): Promise<AnswerResult> {
  const initial = await context(userId);
  if (!initial) return { ok: false, message: "Приглашения на центр оценки пока нет — пришлём уведомление." };
  return db.$transaction(async (tx) => {
    await lockAssessmentCapacity(tx, initial.seasonId);
    const application = await context(userId, tx);
    const invite = application?.assessmentInvite;
    if (!application || !invite) return { ok: false, message: "Приглашения на центр оценки пока нет — пришлём уведомление." };

    const reserve = application.season.assessmentSessions[0] ?? null;
    if (answer === "RESERVE" && (!reserve || reserve.id === invite.sessionId)) {
      return { ok: false, message: "Резервного дня нет — выберите «Буду» или «Не получится»." };
    }
    // Менять можно, пока не начался ни нынешний «свой день», ни тот, куда переходим.
    const current = invite.answer === "RESERVE" ? reserve?.startsAt : invite.answer === "CANT" ? null : invite.session.startsAt;
    const next = answer === "RESERVE" ? reserve?.startsAt : answer === "GOING" ? invite.session.startsAt : null;
    if (!canChangeAnswer(now, current, next)) {
      return { ok: false, message: "Центр оценки уже начался — поменять ответ можно только через организаторов в «Сообщениях»." };
    }
    if (invite.answer === answer) return { ok: true, message: DONE[answer] };
    if (answer === "RESERVE" && reserve) {
      const used = await usedAssessmentPlaces(tx, { ...reserve, seasonId: application.seasonId });
      if (used >= reserve.capacity)
        return { ok: false, message: "В резервном слоте мест больше нет. Напишите организаторам в «Сообщениях»." };
    }

    await tx.assessmentInvite.update({ where: { id: invite.id }, data: { answer, answeredAt: now } });
    return { ok: true, message: DONE[answer] };
  });
}
