import { candidateDecision } from "~~/lib/applications/decisions";
import { fullName } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { stageState, type StageState } from "~~/lib/stages";

/**
 * Запись кандидата на собеседование.
 *
 * Записаться — не позже чем за 2 часа до начала: собеседующим нужно успеть
 * прочитать анкету и домашку. Перенести или отменить — не позже чем за
 * 12 часов: иначе собеседующие уже освободили это время под кандидата.
 *
 * Вместимость слота и правило «одна активная запись на анкету» держатся
 * под замком базы: два человека, нажавшие «Записаться» на один слот в одну
 * секунду, не займут его оба.
 */
export const BOOK_BEFORE_MS = 2 * 60 * 60 * 1000;
export const CHANGE_BEFORE_MS = 12 * 60 * 60 * 1000;
const BOOKING_LOCK = 918_274;

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
    select: { id: true, lastName: true, firstName: true, middleName: true, status: true },
  });
  return { season, stage, application };
}

export interface CandidateInterview {
  state: StageState;
  /** Отсева между этапами нет: записаться может каждый, кто отправил анкету. */
  allowed: boolean;
  final: "PASSED" | "REJECTED" | null;
  booking: { slotId: string; startsAt: Date; endsAt: Date; location: string; canChange: boolean } | null;
  slots: { id: string; startsAt: Date; endsAt: Date; location: string }[];
}

export async function loadInterview(userId: string, now = new Date()): Promise<CandidateInterview | null> {
  const ctx = await context(userId);
  if (!ctx?.stage) return null;

  const allowed = ctx.application?.status === "SUBMITTED";
  const final = await candidateDecision(userId, ctx.season.id, "INTERVIEW");
  const state = stageState(ctx.stage, now);

  const booking = ctx.application
    ? await db.interviewBooking.findFirst({
        where: { applicationId: ctx.application.id, cancelledAt: null },
        select: { slot: { select: { id: true, startsAt: true, endsAt: true, location: true } } },
      })
    : null;

  // Свободные слоты показываем только тем, кто может записаться.
  const slots =
    allowed && state === "open"
      ? (
          await db.interviewSlot.findMany({
            where: { seasonId: ctx.season.id, startsAt: { gt: new Date(now.getTime() + BOOK_BEFORE_MS) } },
            orderBy: { startsAt: "asc" },
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              location: true,
              capacity: true,
              _count: { select: { bookings: { where: { cancelledAt: null } } } },
            },
          })
        )
          .filter((slot) => slot._count.bookings < slot.capacity && slot.id !== booking?.slot.id)
          .map(({ id, startsAt, endsAt, location }) => ({ id, startsAt, endsAt, location }))
      : [];

  return {
    state,
    allowed,
    final,
    booking: booking
      ? { ...booking.slot, slotId: booking.slot.id, canChange: booking.slot.startsAt.getTime() - now.getTime() >= CHANGE_BEFORE_MS }
      : null,
    slots,
  };
}

/** Оценки собеседования — каждому собеседующему слота; пустые чужие — убрать. */
async function syncReviews(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], applicationId: string, interviewerIds: string[]) {
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

export async function book(userId: string, slotId: string, now = new Date()): Promise<BookingResult> {
  const ctx = await context(userId);
  if (!ctx?.stage || !ctx.application) return { ok: false, message: "Анкета не найдена." };
  if (ctx.application.status !== "SUBMITTED") {
    return { ok: false, message: "Сначала отправьте анкету — после этого откроется запись на собеседование." };
  }
  if (stageState(ctx.stage, now) !== "open") return { ok: false, message: "Запись на собеседования сейчас закрыта." };

  const application = ctx.application;

  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);

    const slot = await tx.interviewSlot.findFirst({
      where: { id: slotId, seasonId: ctx.season.id },
      select: {
        id: true,
        startsAt: true,
        location: true,
        capacity: true,
        interviewers: { select: { userId: true } },
        _count: { select: { bookings: { where: { cancelledAt: null } } } },
      },
    });
    if (!slot) return { ok: false as const, message: "Такого времени нет — обновите страницу." };
    if (slot.startsAt.getTime() - now.getTime() < BOOK_BEFORE_MS) {
      return { ok: false as const, message: "На это время уже нельзя записаться — выберите более позднее." };
    }

    const current = await tx.interviewBooking.findFirst({
      where: { applicationId: application.id, cancelledAt: null },
      select: { id: true, slotId: true, slot: { select: { startsAt: true } } },
    });
    if (current?.slotId === slot.id) return { ok: true as const, slot, moved: false };
    if (current && current.slot.startsAt.getTime() - now.getTime() < CHANGE_BEFORE_MS) {
      return { ok: false as const, message: "До собеседования меньше 12 часов — перенести уже нельзя. Напишите организаторам." };
    }
    if (slot._count.bookings >= slot.capacity) {
      return { ok: false as const, message: "Это время только что заняли. Выберите другое." };
    }

    if (current) await tx.interviewBooking.update({ where: { id: current.id }, data: { cancelledAt: now } });
    await tx.interviewBooking.create({ data: { slotId: slot.id, applicationId: application.id, createdAt: now } });
    await syncReviews(tx, application.id, slot.interviewers.map((item) => item.userId));

    return { ok: true as const, slot, moved: Boolean(current) };
  });

  if (!outcome.ok) return outcome;

  const at = when(outcome.slot.startsAt);
  await notify([
    {
      userId,
      category: "SELECTION",
      title: outcome.moved ? "Собеседование перенесено" : "Вы записаны на собеседование",
      body: `${at}, ${outcome.slot.location}`,
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

  return { ok: true, message: `Вы записаны: ${at}, ${outcome.slot.location}.` };
}

export async function cancel(userId: string, now = new Date()): Promise<BookingResult> {
  const ctx = await context(userId);
  if (!ctx?.application) return { ok: false, message: "Анкета не найдена." };
  const applicationId = ctx.application.id;

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const current = await tx.interviewBooking.findFirst({
      where: { applicationId, cancelledAt: null },
      select: { id: true, slot: { select: { startsAt: true } } },
    });
    if (!current) return { ok: false as const, message: "Записи нет." };
    if (current.slot.startsAt.getTime() - now.getTime() < CHANGE_BEFORE_MS) {
      return { ok: false as const, message: "До собеседования меньше 12 часов — отменить уже нельзя. Напишите организаторам." };
    }

    await tx.interviewBooking.update({ where: { id: current.id }, data: { cancelledAt: now } });
    await syncReviews(tx, applicationId, []);
    return { ok: true as const, message: "Запись отменена. Выберите другое время, пока есть свободные." };
  });
}
