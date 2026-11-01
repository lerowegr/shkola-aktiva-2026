import { displayName } from "~~/lib/auth/actor";
import { fullName } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";
import { BOOKING_LOCK } from "./rules";
import { checkOverlap, validateInterviewer, InterviewScheduleError } from "./scheduling";

/**
 * Слоты собеседований: нарезка, создание, расписание.
 *
 * Время вводят по Москве: «20 октября, с 10:00 до 12:00» — и мы так его и
 * понимаем, независимо от часового пояса сервера или браузера.
 */
const MOSCOW = "+03:00";

export interface SlotTime {
  startsAt: Date;
  endsAt: Date;
}

export function cutSlots(params: { date: string; from: string; to: string; duration: number; gap: number }): SlotTime[] {
  if (params.duration <= 0 || params.gap < 0) return [];

  const start = new Date(`${params.date}T${params.from}:00${MOSCOW}`);
  const end = new Date(`${params.date}T${params.to}:00${MOSCOW}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const slots: SlotTime[] = [];
  const step = (params.duration + params.gap) * 60_000;
  for (let at = start.getTime(); at + params.duration * 60_000 <= end.getTime(); at += step) {
    slots.push({ startsAt: new Date(at), endsAt: new Date(at + params.duration * 60_000) });
    // Защита от ошибки в параметрах: больше сорока слотов за раз — опечатка.
    if (slots.length >= 40) break;
  }
  return slots;
}

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
      if (!Number.isFinite(slot.startsAt.getTime()) || !Number.isFinite(slot.endsAt.getTime()) || slot.endsAt <= slot.startsAt || (i > 0 && ordered[i - 1]!.endsAt > slot.startsAt)) throw new InterviewScheduleError("Время некорректно или слоты пересекаются.");
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
  startsAt: Date;
  endsAt: Date;
  location: string;
  room: string | null;
  capacity: number;
  interviewers: { id: string; name: string }[];
  mine: boolean;
  bookings: { applicationId: string; name: string; telegramUsername: string | null; faculty: string | null; reschedulesUsed: number }[];
}

/** Расписание организаторов: все слоты сезона по времени. */
export async function schedule(seasonId: string, viewerId: string): Promise<ScheduleSlot[]> {
  const slots = await db.interviewSlot.findMany({
    where: { seasonId },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
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
              user: { select: { telegramUsername: true, faculty: true } },
            },
          },
        },
      },
    },
  });

  return slots.map((slot) => ({
    id: slot.id,
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
      telegramUsername: booking.application.user.telegramUsername,
      faculty: booking.application.user.faculty,
    })),
  }));
}
