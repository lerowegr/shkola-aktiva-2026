import { db } from "~~/lib/db";
import { stageState, type StageState } from "~~/lib/stages";

import { syncMemberReviews } from "./groups";
import { canChangeBooking, hasRoom, offeredTo, placeOf, readPlace, type Place } from "./rules";

/**
 * Центр оценки глазами кандидата: что это за этап, где и когда, и — если
 * организаторы открыли самозапись — какие даты можно выбрать.
 *
 * Ни баллов, ни комментариев, ни «прошёл / не прошёл»: на ЦО оценивают всех,
 * а дальше кандидат просто ждёт следующего этапа. Этот файл не читает оценки
 * вовсе — так их точно не утащить в ответ.
 *
 * Два вида групп. Собранную организаторами (capacity = null) кандидат видит
 * после рассылки — снимком места. На группу с самозаписью (capacity — число)
 * он записывается сам, выбирая дату для своего факультета, и видит место сразу.
 */
export interface AssessmentOption {
  id: string;
  startsAt: Date;
  building: string | null;
  room: string | null;
  note: string | null;
  free: number;
}

export interface CandidateAssessment {
  title: string;
  description: string | null;
  state: StageState;
  opensAt: Date | null;
  closesAt: Date | null;
  /** Где и когда: снимок рассылки или, при самозаписи, текущее место. */
  place: Place | null;
  notifiedAt: Date | null;
  /** Записался сам — значит, может перенести или отменить (до 12 часов). */
  selfBooked: boolean;
  canChange: boolean;
  /** Даты, которые можно выбрать: свой факультет, есть места. */
  options: AssessmentOption[];
}

/** Тот же принцип, что у собеседований: запись и перенос — под замком. */
const ASSESSMENT_LOCK = 918_275;

async function context(userId: string) {
  return db.application.findFirst({
    where: { userId, status: "SUBMITTED", season: { isCurrent: true } },
    select: {
      id: true,
      seasonId: true,
      user: { select: { faculty: true } },
      season: {
        select: {
          stages: {
            where: { kind: "ASSESSMENT" },
            select: { title: true, description: true, mode: true, opensAt: true, closesAt: true },
          },
        },
      },
      assessment: {
        select: {
          group: {
            select: { id: true, notified: true, notifiedAt: true, capacity: true, building: true, room: true, startsAt: true, note: true },
          },
        },
      },
    },
  });
}

export async function loadCandidateAssessment(userId: string, now = new Date()): Promise<CandidateAssessment | null> {
  const application = await context(userId);
  const stage = application?.season.stages[0];
  if (!application || !stage) return null;

  // Отсева между этапами нет: ЦО — для каждого, кто отправил анкету (условие выше).
  const group = application.assessment?.group ?? null;
  const state = stageState(stage, now);
  const selfBooked = group?.capacity != null;
  const canChange = selfBooked && canChangeBooking(group!.startsAt, now);

  // Выбор дат: этап не закрыт, и кандидат ещё без группы — или записан сам и может перенести.
  const choosing = state !== "closed" && (!group || canChange);
  const groups = choosing
    ? await db.assessmentGroup.findMany({
        where: { seasonId: application.seasonId, capacity: { not: null }, startsAt: { not: null } },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          building: true,
          room: true,
          note: true,
          capacity: true,
          faculties: true,
          _count: { select: { members: true } },
        },
      })
    : [];
  const faculty = application.user.faculty;
  const options = groups
    .map((item) => ({ ...item, taken: item._count.members }))
    .filter((item) => item.id !== group?.id && offeredTo(item, faculty, now) && hasRoom(item))
    .map((item) => ({
      id: item.id,
      startsAt: item.startsAt!,
      building: item.building,
      room: item.room,
      note: item.note,
      free: item.capacity! - item.taken,
    }));

  return {
    title: stage.title,
    description: stage.description?.trim() || null,
    state,
    opensAt: stage.opensAt,
    closesAt: stage.closesAt,
    place: selfBooked ? placeOf(group!) : group?.notifiedAt ? readPlace(group.notified) : null,
    notifiedAt: group?.notifiedAt ?? null,
    selfBooked,
    canChange,
    options,
  };
}

export type AssessmentBookingResult = { ok: true; message: string } | { ok: false; message: string };

/** Записаться на дату ЦО или перенести свою запись. */
export async function bookAssessment(userId: string, groupId: string, now = new Date()): Promise<AssessmentBookingResult> {
  const application = await context(userId);
  const stage = application?.season.stages[0];
  if (!application || !stage) return { ok: false, message: "Сначала отправьте анкету — после неё откроется выбор даты." };
  if (stageState(stage, now) === "closed") return { ok: false, message: "Запись на центр оценки закрыта." };

  const current = application.assessment?.group ?? null;
  if (current && current.capacity === null) {
    return { ok: false, message: "Вас уже распределили в группу организаторы. Если дата не подходит — напишите им в «Сообщениях»." };
  }
  if (current && !canChangeBooking(current.startsAt, now)) {
    return { ok: false, message: "До центра оценки меньше 12 часов — перенести запись можно только через организаторов." };
  }
  if (current?.id === groupId) return { ok: true, message: "Вы уже записаны на эту дату." };

  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ASSESSMENT_LOCK})`);
    const group = await tx.assessmentGroup.findFirst({
      where: { id: groupId, seasonId: application.seasonId },
      select: { capacity: true, faculties: true, startsAt: true, _count: { select: { members: true } } },
    });
    if (!group) return "Такой даты нет — обновите страницу.";
    const shape = { ...group, taken: group._count.members };
    if (!offeredTo(shape, application.user.faculty, now)) return "Эта дата недоступна для вашего факультета или запись на неё закрыта.";
    if (!hasRoom(shape)) return "На эту дату места закончились — выберите другую.";

    await tx.assessmentMember.upsert({
      where: { applicationId: application.id },
      create: { applicationId: application.id, groupId },
      update: { groupId, addedAt: now },
    });
    return null;
  });
  if (outcome) return { ok: false, message: outcome };

  await syncMemberReviews(application.id, groupId, null);
  return { ok: true, message: current ? "Запись перенесена." : "Вы записаны на центр оценки!" };
}

/** Отменить свою запись: снова «без группы», можно выбрать другую дату. */
export async function cancelAssessment(userId: string, now = new Date()): Promise<AssessmentBookingResult> {
  const application = await context(userId);
  const current = application?.assessment?.group ?? null;
  if (!application || !current) return { ok: false, message: "Вы пока не записаны на центр оценки." };
  if (current.capacity === null) {
    return { ok: false, message: "В группу вас распределили организаторы — отменить можно только через них." };
  }
  if (!canChangeBooking(current.startsAt, now)) {
    return { ok: false, message: "До центра оценки меньше 12 часов — отменить запись можно только через организаторов." };
  }
  await db.assessmentMember.deleteMany({ where: { applicationId: application.id } });
  await syncMemberReviews(application.id, null, null);
  return { ok: true, message: "Запись отменена. Выберите другую дату." };
}
