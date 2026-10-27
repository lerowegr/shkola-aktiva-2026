import { db } from "~~/lib/db";
import { stageState, type StageState } from "~~/lib/stages";

import { lockAssessmentCapacity, usedAssessmentPlaces, type AssessmentTx } from "./capacity";
import { ASSESSMENT_CHANGE_MS, canChangeAnswer, mskDayKey, placeProblem, slotPlace, slotStartsAt, type AssessmentAnswerKind, type Place } from "./rules";

export interface CandidateDay extends Place { title: string; reserve: boolean }
export interface CandidateSlot extends CandidateDay { id: string; current: boolean; full: boolean; closed: boolean }
export interface CandidateAssessment {
  title: string;
  description: string | null;
  state: StageState;
  opensAt: Date | null;
  closesAt: Date | null;
  invite: {
    answer: AssessmentAnswerKind | null;
    reserveQueued: boolean;
    reserveOffered: boolean;
    invitedDay: string;
    faculty: string | null;
    session: CandidateDay;
    reserve: CandidateDay | null;
    day: CandidateDay | null;
    canChange: boolean;
    changeClosesAt: string | null;
    slots: CandidateSlot[];
    reserveSlots: CandidateSlot[];
  } | null;
}

const sessionSelect = { id: true, seasonId: true, title: true, reserve: true, capacity: true, faculties: true, building: true, room: true, startsAt: true, note: true, invited: true } as const;
type Session = { id: string; seasonId: string; title: string; reserve: boolean; capacity: number; faculties: string[]; building: string | null; room: string | null; startsAt: Date; note: string | null; invited: unknown };
type Client = Pick<typeof db, "application" | "assessmentSession" | "assessmentInvite">;
const asDay = (session: Session): CandidateDay => ({ ...slotPlace(session), title: session.title, reserve: session.reserve });

async function context(userId: string, client: Client = db) {
  return client.application.findFirst({
    where: { userId, status: "SUBMITTED", season: { isCurrent: true } },
    select: {
      id: true, seasonId: true, user: { select: { faculty: true } },
      season: { select: {
        stages: { where: { kind: "ASSESSMENT" }, select: { title: true, description: true, mode: true, opensAt: true, closesAt: true } },
        assessmentSessions: { where: { reserve: true }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], select: sessionSelect },
      } },
      assessmentInvite: { select: { id: true, sessionId: true, answer: true, reserveQueued: true, reserveOffered: true, invitedDay: true, invitedFaculty: true, session: { select: sessionSelect } } },
    },
  });
}
type Context = NonNullable<Awaited<ReturnType<typeof context>>>;

function booked(application: Context): Session | null {
  const invite = application.assessmentInvite;
  if (!invite || invite.reserveQueued) return null;
  if (invite.answer === "GOING") return invite.session;
  // Совместимость назначений, сделанных до самостоятельного выбора резерва.
  return invite.answer === "RESERVE" ? application.season.assessmentSessions[0] ?? null : null;
}

async function slotsFor(client: Client, application: Context, now: Date): Promise<CandidateSlot[]> {
  const invite = application.assessmentInvite;
  if (!invite) return [];
  const faculty = invite.invitedFaculty ?? application.user.faculty;
  const day = invite.invitedDay ?? mskDayKey(slotStartsAt(invite.session));
  const sessions = (await client.assessmentSession.findMany({ where: { seasonId: application.seasonId }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], select: sessionSelect }))
    .filter((slot) => slot.reserve
      ? slot.faculties.length === 0 || (faculty !== null && slot.faculties.includes(faculty))
      : mskDayKey(slotStartsAt(slot)) === day && (slot.id === invite.sessionId || (faculty !== null && slot.faculties.includes(faculty))));
  const taken = await client.assessmentInvite.groupBy({ by: ["sessionId"], where: { sessionId: { in: sessions.map((slot) => slot.id) }, answer: "GOING", reserveQueued: false }, _count: { _all: true } });
  const used = new Map(taken.map((row) => [row.sessionId, row._count._all]));
  const legacy = await client.assessmentInvite.count({ where: { answer: "RESERVE", reserveQueued: false, session: { seasonId: application.seasonId } } });
  const legacyReserveId = application.season.assessmentSessions[0]?.id;
  const current = booked(application)?.id;
  return sessions.filter((slot) => !placeProblem(slotPlace(slot))).map((slot) => {
    const own = slot.id === current;
    const count = (used.get(slot.id) ?? 0) + (slot.id === legacyReserveId ? legacy : 0);
    return { ...asDay(slot), id: slot.id, current: own, full: count - (own ? 1 : 0) >= slot.capacity, closed: !canChangeAnswer(now, slotStartsAt(slot)) };
  });
}

export async function loadCandidateAssessment(userId: string, now = new Date()): Promise<CandidateAssessment | null> {
  const application = await context(userId);
  const stage = application?.season.stages[0];
  if (!application || !stage) return null;
  let view: CandidateAssessment["invite"] = null;
  const invite = application.assessmentInvite;
  if (invite) {
    const current = booked(application);
    const choices = await slotsFor(db, application, now);
    view = {
      answer: invite.answer, reserveQueued: invite.reserveQueued, reserveOffered: invite.reserveOffered,
      invitedDay: invite.invitedDay ?? mskDayKey(slotStartsAt(invite.session)), faculty: invite.invitedFaculty ?? application.user.faculty,
      session: asDay(invite.session), reserve: application.season.assessmentSessions[0] ? asDay(application.season.assessmentSessions[0]) : null,
      day: current ? asDay(current) : null,
      canChange: canChangeAnswer(now, current ? slotStartsAt(current) : null),
      changeClosesAt: current ? new Date(new Date(slotStartsAt(current)).getTime() - ASSESSMENT_CHANGE_MS).toISOString() : null,
      slots: choices.filter((slot) => !slot.reserve), reserveSlots: choices.filter((slot) => slot.reserve),
    };
  }
  return { title: stage.title, description: stage.description?.trim() || null, state: stageState(stage, now), opensAt: stage.opensAt, closesAt: stage.closesAt, invite: view };
}

export type AnswerResult = { ok: boolean; message: string };
const NO_INVITE = { ok: false, message: "Приглашения на центр оценки пока нет — пришлём уведомление." };
const TOO_LATE = { ok: false, message: "До начала записанного времени осталось меньше 2 часов. Перезапись или отказ — только через организаторов в «Сообщениях»." };

/** Снятие прежней подгруппы атомарно с записью; начатые оценки не удаляются. */
async function detach(tx: AssessmentTx, applicationId: string) {
  await tx.assessmentMember.deleteMany({ where: { applicationId } });
  await tx.review.deleteMany({ where: { applicationId, stageKind: "ASSESSMENT", scores: { none: {} }, markers: { none: {} }, OR: [{ comment: null }, { comment: "" }] } });
}

export async function chooseSlot(userId: string, sessionId: string, now = new Date()): Promise<AnswerResult & { movedFrom?: string }> {
  const initial = await context(userId);
  if (!initial?.assessmentInvite) return NO_INVITE;
  return db.$transaction(async (tx) => {
    await lockAssessmentCapacity(tx, initial.seasonId);
    const application = await context(userId, tx);
    const invite = application?.assessmentInvite;
    if (!application || !invite) return NO_INVITE;
    const current = booked(application);
    if (current?.id === sessionId) return { ok: true, message: "Вы уже записаны на это время." };
    if (current && !canChangeAnswer(now, slotStartsAt(current))) return TOO_LATE;
    const target = (await slotsFor(tx, application, now)).find((slot) => slot.id === sessionId);
    if (!target) return { ok: false, message: "Этот слот недоступен для дня и факультета вашего приглашения. Обновите страницу." };
    if (target.closed) return { ok: false, message: "Запись на это время закрыта: до начала меньше 2 часов. Выберите другое время или резервный день." };
    if (target.full) return { ok: false, message: "На это время все места заняты — выберите другое время или резервный день." };
    const session = await tx.assessmentSession.findUniqueOrThrow({ where: { id: sessionId }, select: sessionSelect });
    if (await usedAssessmentPlaces(tx, session) >= session.capacity) return { ok: false, message: "Место уже заняли. Выберите другое время или резервный день." };
    if (!session.invited) await tx.assessmentSession.update({ where: { id: sessionId }, data: { invited: { ...slotPlace(session) } } });
    await detach(tx, application.id);
    await tx.assessmentInvite.update({ where: { id: invite.id }, data: {
      sessionId, answer: "GOING", reserveQueued: false, answeredAt: now, attended: false,
      invitedDay: invite.invitedDay ?? mskDayKey(slotStartsAt(invite.session)), invitedFaculty: invite.invitedFaculty ?? application.user.faculty,
    } });
    return { ok: true, message: "Вы записаны на выбранное время. Перезаписаться или отказаться можно не позже чем за 2 часа до начала.", movedFrom: invite.sessionId };
  }, { timeout: 30_000 });
}

export async function answerInvite(userId: string, answer: AssessmentAnswerKind, now = new Date()): Promise<AnswerResult> {
  const initial = await context(userId);
  if (!initial?.assessmentInvite) return NO_INVITE;
  if (answer === "GOING") {
    const current = booked(initial);
    if (current) return chooseSlot(userId, current.id, now);
    const slots = (await slotsFor(db, initial, now)).filter((slot) => !slot.reserve);
    if (slots.length !== 1) return { ok: false, message: "Выберите конкретное время в списке слотов." };
    return chooseSlot(userId, slots[0]!.id, now);
  }
  return db.$transaction(async (tx) => {
    await lockAssessmentCapacity(tx, initial.seasonId);
    const application = await context(userId, tx);
    const invite = application?.assessmentInvite;
    if (!application || !invite) return NO_INVITE;
    if (invite.answer === answer) return { ok: true, message: answer === "RESERVE" ? "Вы в очереди на резервный день. Выберите время резерва, когда оно появится." : "Ваш отказ сохранён." };
    const current = booked(application);
    if (current && !canChangeAnswer(now, slotStartsAt(current))) return TOO_LATE;
    await detach(tx, application.id);
    await tx.assessmentInvite.update({ where: { id: invite.id }, data: {
      answer, reserveQueued: answer === "RESERVE", reserveOffered: false, answeredAt: now, attended: false,
      invitedDay: invite.invitedDay ?? mskDayKey(slotStartsAt(invite.session)), invitedFaculty: invite.invitedFaculty ?? application.user.faculty,
    } });
    return { ok: true, message: answer === "RESERVE" ? "Вы в очереди на резервный день. Выберите подходящее резервное время или ждите отдельного приглашения, если слоты ещё не созданы." : "Вы отказались от записи. Место освобождено; организаторы с вами свяжутся." };
  });
}
