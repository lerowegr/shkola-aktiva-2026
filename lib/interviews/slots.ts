import { can } from "~~/lib/permissions";
import { reviewSummary } from "~~/lib/applications/review";
import { displayName, loadUser } from "~~/lib/auth/actor";
import { fullName } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";
import { BOOKING_LOCK, INTERVIEW_BREAK_MS } from "./rules";
import { checkOverlap, validateInterviewer, InterviewScheduleError } from "./scheduling";

/**
 * Слоты собеседований: нарезка, создание, расписание.
 *
 * Время вводят по Москве: «20 октября, с 10:00 до 12:00» — и мы так его и
 * понимаем, независимо от часового пояса сервера или браузера.
 */
export { cutSlots } from "./availability";

export interface SlotTime { startsAt: Date; endsAt: Date }

export async function createSlots(params: {
  seasonId: string;
  slots: SlotTime[];
  location: string;
  capacity: number;
  interviewerIds: string[];
  createdById: string | null;
}) {
  if (params.interviewerIds.length !== 1 || params.capacity !== 1) throw new InterviewScheduleError("На собеседовании должны быть ровно один мастер и один кандидат.");
  if (!params.location.trim() || params.location.length > 300 || !params.slots.length || params.slots.length > 40) throw new InterviewScheduleError("Укажите корпус и корректный диапазон времени.");
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    await validateInterviewer(tx, params.interviewerIds[0]!);
    const ordered = [...params.slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (const [i, slot] of ordered.entries()) {
      if (!Number.isFinite(slot.startsAt.getTime()) || !Number.isFinite(slot.endsAt.getTime()) || slot.endsAt <= slot.startsAt || (i > 0 && +ordered[i - 1]!.endsAt + INTERVIEW_BREAK_MS > +slot.startsAt)) throw new InterviewScheduleError("Время некорректно или слоты пересекаются.");
      await checkOverlap(tx, params.interviewerIds[0]!, slot.startsAt, slot.endsAt);
    }
    const created: { id: string }[] = [];
    for (const slot of params.slots) created.push(await tx.interviewSlot.create({ data: {
      seasonId: params.seasonId, ...slot, location: params.location.trim(), capacity: 1,
      createdById: params.createdById, interviewers: { create: { userId: params.interviewerIds[0]! } },
    }, select: { id: true } }));
    return created;
  });
}

/** Удалить слот можно, только пока на него никто не записан. */
export async function deleteSlot(slotId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const active = await tx.interviewBooking.count({ where: { slotId, cancelledAt: null } });
    if (active > 0) return { ok: false as const, message: "На слот уже записан кандидат — сначала договоритесь с ним о переносе." };
    await tx.interviewSlot.deleteMany({ where: { id: slotId } });
    return { ok: true as const };
  });
}

export interface ScheduleSlot {
  id: string;
  archivedAt: Date | null;
  startsAt: Date;
  endsAt: Date;
  location: string;
  room: string | null;
  capacity: number;
  interviewers: { id: string; name: string }[];
  mine: boolean;
  bookings: { applicationId: string; name: string; telegramUsername: string | null; faculty: string | null; hasTelegram: boolean; reschedulesUsed: number; scoreSummary: { label: string; percent: number | null }[] }[];
}

/** Расписание организаторов: слоты сезона по времени. Мастер без права «все анкеты» видит только слоты, где он собеседующий. */
export async function schedule(seasonId: string, viewerId: string, archived = false): Promise<ScheduleSlot[]> {
  const viewer = await loadUser(viewerId);
  const seeAll = viewer !== null && can(viewer, "applications.view_all");
  const slots = await db.interviewSlot.findMany({
    where: {
      seasonId,
      archivedAt: archived ? { not: null } : null,
      ...(seeAll ? {} : { interviewers: { some: { userId: viewerId } } }),
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      archivedAt: true,
      startsAt: true,
      endsAt: true,
      location: true,
      room: true,
      capacity: true,
      interviewers: {
        select: { user: { select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true } } },
      },
      bookings: {
        where: { cancelledAt: null },
        select: {
          application: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              interviewReschedulesUsed: true,
              user: { select: { telegramUsername: true, telegramId: true, faculty: true } },
              reviews: { where: { releasedAt: null }, select: { stageKind: true, scores: { select: { criterionId: true, score: true } } } },
            },
          },
        },
      },
    },
  });

  const criteria = await db.criterion.findMany({ where: { seasonId }, select: { id: true, stageKind: true, maxScore: true } });
  const stages = [{ kind: "APPLICATION", label: "Анкета" }, { kind: "HOMEWORK", label: "ДЗ" }, { kind: "ASSESSMENT", label: "ЦО" }] as const;
  return slots.map((slot) => ({
    id: slot.id,
    archivedAt: slot.archivedAt,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    location: slot.location,
    room: slot.room,
    capacity: slot.capacity,
    interviewers: slot.interviewers.map((item) => ({ id: item.user.id, name: displayName(item.user) })),
    mine: slot.interviewers.some((item) => item.user.id === viewerId),
    bookings: slot.bookings.map((booking) => ({
      applicationId: booking.application.id,
      name: fullName(booking.application),
      reschedulesUsed: booking.application.interviewReschedulesUsed,
      hasTelegram: booking.application.user.telegramId !== null,
      scoreSummary: viewer && (can(viewer, "applications.view_all") || (can(viewer, "applications.review") && slot.interviewers.some(i => i.user.id === viewerId))) ? stages.map(stage => {
        const fields = criteria.filter(c => c.stageKind === stage.kind);
        const complete = booking.application.reviews.filter(r => r.stageKind === stage.kind).map(r => reviewSummary(fields, r.scores)).filter(r => r.status === "done");
        const percent = complete.length && complete[0]!.max > 0 ? Math.round(complete.reduce((n, r) => n + (r.total ?? 0) / r.max * 100, 0) / complete.length) : null;
        return { label: stage.label, percent };
      }) : [],
      telegramUsername: booking.application.user.telegramUsername,
      faculty: booking.application.user.faculty,
    })),
  }));
}
