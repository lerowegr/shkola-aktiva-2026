import { candidateDecision } from "~~/lib/applications/decisions";
import { fullName } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { ASSESSMENT_REQUIRED, hasAssessmentAttendance } from "./eligibility";
import { BOOKING_LOCK, canReschedule, changeDeadline, interviewPlace } from "./rules";
import { checkOverlap, InterviewScheduleError, validateInterviewer } from "./scheduling";
import { stageState, type StageState } from "~~/lib/stages";

/**
 * Запись кандидата на собеседование.
 *
 * Записаться — не позже чем за 2 часа до начала: собеседующим нужно успеть
 * прочитать анкету и домашку. Перенести самостоятельно можно один раз,
 * до 18:00 предыдущего дня по Москве. Отмена — через организатора.
 *
 * Вместимость слота и правило «одна активная запись на анкету» держатся
 * под замком базы: два человека, нажавшие «Записаться» на один слот в одну
 * секунду, не займут его оба.
 */
export const BOOK_BEFORE_MS = 2 * 60 * 60 * 1000;


export type BookingResult = { ok: true; message: string } | { ok: false; message: string };

function when(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

async function context(userId: string) {
  const season = await db.season.findFirst({
    where: { isCurrent: true },
    select: { id: true, stages: { where: { kind: "INTERVIEW" }, select: { mode: true, opensAt: true, closesAt: true } } },
  });
  if (!season) return null;
  const stage = season.stages[0];
  const application = await db.application.findUnique({
    where: { seasonId_userId: { seasonId: season.id, userId } },
    select: { id: true, lastName: true, firstName: true, middleName: true, status: true, interviewReschedulesUsed: true, assessmentInvite: { select: { attended: true } }, _count: { select: { bookings: true } } },
  });
  return { season, stage, application };
}

export interface CandidateInterview {
  state: StageState;
  /** Для записи нужны отправленная анкета и отметка явки на ЦО. */
  allowed: boolean;
  eligibilityMessage: string | null;
  final: "PASSED" | "REJECTED" | null;
  booking: { slotId: string; startsAt: Date; endsAt: Date; location: string; room: string | null; canChange: boolean; changeDeadline: Date } | null;
  reschedulesUsed: number;
  bookingCancelled: boolean;
  slots: { id: string; startsAt: Date; endsAt: Date; location: string; room: string | null }[];
}

export async function loadInterview(userId: string, now = new Date()): Promise<CandidateInterview | null> {
  const ctx = await context(userId);
  if (!ctx?.stage) return null;

  const submitted = ctx.application?.status === "SUBMITTED";
  const allowed = submitted && ctx.application?.assessmentInvite?.attended === true;
  const final = await candidateDecision(userId, ctx.season.id, "INTERVIEW");
  const state = stageState(ctx.stage, now);

  const booking = ctx.application
    ? await db.interviewBooking.findFirst({
        where: { applicationId: ctx.application.id, cancelledAt: null },
        select: { slot: { select: { id: true, startsAt: true, endsAt: true, location: true, room: true } } },
      })
    : null;

  // Свободные слоты показываем только тем, кто может записаться.
  const slots =
    allowed && state === "open" && ((!booking && ctx.application!._count.bookings === 0) || (booking && canReschedule(booking.slot.startsAt, ctx.application!.interviewReschedulesUsed, now)))
      ? (
          await db.interviewSlot.findMany({
            where: { seasonId: ctx.season.id, capacity: 1, startsAt: { gte: new Date(now.getTime() + BOOK_BEFORE_MS) } },
            orderBy: { startsAt: "asc" },
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              location: true,
              room: true,
              interviewers: { select: { userId: true } },
              capacity: true,
              _count: { select: { bookings: { where: { cancelledAt: null } } } },
            },
          })
        )
          .filter((slot) => slot.interviewers.length === 1 && slot._count.bookings < slot.capacity && slot.id !== booking?.slot.id && (!booking || now <= changeDeadline(slot.startsAt)))
          .map(({ id, startsAt, endsAt, location, room }) => ({ id, startsAt, endsAt, location, room }))
      : [];

  return {
    state,
    allowed,
    eligibilityMessage: allowed ? null : submitted ? ASSESSMENT_REQUIRED : "Сначала отправьте анкету — после этого откроется запись на собеседование.",
    final,
    reschedulesUsed: ctx.application?.interviewReschedulesUsed ?? 0,
    bookingCancelled: !booking && Boolean(ctx.application?._count.bookings),
    booking: booking
      ? { ...booking.slot, slotId: booking.slot.id, canChange: allowed && state === "open" && canReschedule(booking.slot.startsAt, ctx.application!.interviewReschedulesUsed, now), changeDeadline: changeDeadline(booking.slot.startsAt) }
      : null,
    slots,
  };
}

/** Оценки собеседования — каждому собеседующему слота; пустые чужие — убрать. */
export async function syncReviews(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], applicationId: string, interviewerIds: string[]) {
  const existing = await tx.review.findMany({
    where: { applicationId, stageKind: "INTERVIEW" },
    select: { id: true, reviewerId: true, comment: true, _count: { select: { scores: true, markers: true } } },
  });

  const untouched = (review: (typeof existing)[number]) =>
    review._count.scores === 0 && review._count.markers === 0 && !review.comment;

  const stale = existing.filter((review) => !interviewerIds.includes(review.reviewerId) && untouched(review));
  if (stale.length) await tx.review.deleteMany({ where: { id: { in: stale.map((review) => review.id) } } });

  const have = new Set(existing.map((review) => review.reviewerId));
  const missing = interviewerIds.filter((id) => !have.has(id));
  if (missing.length) {
    await tx.review.createMany({
      data: missing.map((reviewerId) => ({ applicationId, stageKind: "INTERVIEW" as const, reviewerId })),
    });
  }
}

/**
 * Собеседующие слота целиком: кого нет в списке — снимается. Записанным
 * кандидатам оценки пересчитываются как при записи: новым собеседующим —
 * заготовки, пустые у снятых — убираются, начатые остаются.
 */
export async function setSlotInterviewers(
  slotId: string,
  interviewerIds: string[],
): Promise<{ ok: true; added: string[]; removed: string[] } | { ok: false; message: string }> {
  const wanted = [...new Set(interviewerIds)];
  if (wanted.length !== 1) return { ok: false, message: "На собеседовании должен быть ровно один мастер." };

  return db.$transaction(async (tx) => {
    // Тот же замок, что у записи: кандидат не запишется посреди смены состава.
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const slot = await tx.interviewSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true, startsAt: true, endsAt: true,
        interviewers: { select: { userId: true } },
        bookings: { where: { cancelledAt: null }, select: { applicationId: true } },
      },
    });
    if (!slot) return { ok: false as const, message: "Слот не найден — обновите страницу." };

    if (slot.bookings.length > 1) return { ok: false as const, message: "В старом слоте несколько кандидатов. Сначала перенесите их по отдельным собеседованиям." };
    try {
      await validateInterviewer(tx, wanted[0]!);
      await checkOverlap(tx, wanted[0]!, slot.startsAt, slot.endsAt, slotId);
    } catch (error) {
      if (error instanceof InterviewScheduleError) return { ok: false as const, message: error.message };
      throw error;
    }
    await tx.interviewSlot.update({ where: { id: slotId }, data: { capacity: 1 } });
    const current = slot.interviewers.map((item) => item.userId);
    const added = wanted.filter((id) => !current.includes(id));
    const removed = current.filter((id) => !wanted.includes(id));
    await tx.slotInterviewer.deleteMany({ where: { slotId, userId: { in: removed } } });
    if (added.length) await tx.slotInterviewer.createMany({ data: added.map((userId) => ({ slotId, userId })), skipDuplicates: true });
    for (const booking of slot.bookings) await syncReviews(tx, booking.applicationId, wanted);
    return { ok: true as const, added, removed };
  });
}

export async function book(userId: string, slotId: string, now = new Date()): Promise<BookingResult> {
  const ctx = await context(userId);
  if (!ctx?.stage || !ctx.application) return { ok: false, message: "Анкета не найдена." };
  if (ctx.application.status !== "SUBMITTED") {
    return { ok: false, message: "Сначала отправьте анкету — после этого откроется запись на собеседование." };
  }
  if (!ctx.application.assessmentInvite?.attended) return { ok: false, message: ASSESSMENT_REQUIRED };
  if (stageState(ctx.stage, now) !== "open") return { ok: false, message: "Запись на собеседования сейчас закрыта." };

  const application = ctx.application;

  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);

    if (!await hasAssessmentAttendance(tx, application.id)) return { ok: false as const, message: ASSESSMENT_REQUIRED };

    const slot = await tx.interviewSlot.findFirst({
      where: { id: slotId, seasonId: ctx.season.id },
      select: {
        id: true,
        startsAt: true,
        location: true,
        room: true,
        capacity: true,
        interviewers: { select: { userId: true } },
        _count: { select: { bookings: { where: { cancelledAt: null } } } },
      },
    });
    if (!slot) return { ok: false as const, message: "Такого времени нет — обновите страницу." };
    if (slot.capacity !== 1 || slot.interviewers.length !== 1) return { ok: false as const, message: "Этот слот уточняется организаторами. Выберите другое время." };
    try { await validateInterviewer(tx, slot.interviewers[0]!.userId); }
    catch (error) { if (error instanceof InterviewScheduleError) return { ok: false as const, message: error.message }; throw error; }
    if (slot.startsAt.getTime() - now.getTime() < BOOK_BEFORE_MS) {
      return { ok: false as const, message: "На это время уже нельзя записаться — выберите более позднее." };
    }

    const current = await tx.interviewBooking.findFirst({
      where: { applicationId: application.id, cancelledAt: null },
      select: { id: true, slotId: true, slot: { select: { startsAt: true } } },
    });
    if (current?.slotId === slot.id) return { ok: true as const, slot, moved: false, changed: false };
    const applicationState = await tx.application.findUniqueOrThrow({ where: { id: application.id }, select: { interviewReschedulesUsed: true } });
    if (current && !canReschedule(current.slot.startsAt, applicationState.interviewReschedulesUsed, now)) {
      return { ok: false as const, message: applicationState.interviewReschedulesUsed >= 1 ? "Вы уже использовали единственную перезапись. Для дополнительного переноса обратитесь к организаторам." : "Срок переноса закончился в 18:00 предыдущего дня. Обратитесь к организаторам." };
    }
    if (current && now > changeDeadline(slot.startsAt)) return { ok: false as const, message: "Для нового времени срок перезаписи уже закончился. Выберите другой день." };
    if (!current && await tx.interviewBooking.count({ where: { applicationId: application.id } })) return { ok: false as const, message: "Предыдущая запись отменена. Для новой записи обратитесь к организаторам." };
    if (slot._count.bookings >= slot.capacity) {
      return { ok: false as const, message: "Это время только что заняли. Выберите другое." };
    }

    if (current) {
      await tx.interviewBooking.update({ where: { id: current.id }, data: { cancelledAt: now } });
      await tx.application.update({ where: { id: application.id }, data: { interviewReschedulesUsed: { increment: 1 } } });
    }
    await tx.interviewBooking.create({ data: { slotId: slot.id, applicationId: application.id, createdAt: now } });
    await syncReviews(tx, application.id, slot.interviewers.map((item) => item.userId));

    return { ok: true as const, slot, moved: Boolean(current), changed: true };
  });

  if (!outcome.ok) return outcome;
  if (!outcome.changed) return { ok: true, message: "Вы уже записаны на это время." };

  const at = when(outcome.slot.startsAt);
  await notify([
    {
      userId,
      category: "SELECTION",
      title: outcome.moved ? "Собеседование перенесено" : "Вы записаны на собеседование",
      body: `${at}, ${interviewPlace(outcome.slot)}`,
      url: "/cabinet/interview",
    },
    ...outcome.slot.interviewers.map((item) => ({
      userId: item.userId,
      category: "REVIEW" as const,
      title: "Новая запись на собеседование",
      body: `${fullName(application)} — ${at}`,
      url: `/staff/applications/${application.id}?stage=INTERVIEW`,
    })),
  ]);

  return { ok: true, message: `Вы записаны: ${at}, ${interviewPlace(outcome.slot)}.` };
}

/** Отдельная отмена не даёт обойти единственный перенос через повторную запись. */
export async function cancel(_userId: string, _now = new Date()): Promise<BookingResult> {
  return { ok: false, message: "Для отмены записи обратитесь к организаторам. В кабинете можно один раз выбрать другое время до 18:00 предыдущего дня." };
}
