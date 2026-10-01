import { displayName } from "~~/lib/auth/actor";
import { fullName } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";

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
  return db.$transaction(
    params.slots.map((slot) =>
      db.interviewSlot.create({
        data: {
          seasonId: params.seasonId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          location: params.location,
          capacity: params.capacity,
          createdById: params.createdById,
          interviewers: { create: params.interviewerIds.map((userId) => ({ userId })) },
        },
        select: { id: true },
      }),
    ),
  );
}

/** Удалить слот можно, только пока на него никто не записан. */
export async function deleteSlot(slotId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const active = await db.interviewBooking.count({ where: { slotId, cancelledAt: null } });
  if (active > 0) return { ok: false, message: "На слот уже записан кандидат — сначала договоритесь с ним о переносе." };
  await db.interviewSlot.delete({ where: { id: slotId } }).catch(() => null);
  return { ok: true };
}

export interface ScheduleSlot {
  id: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  capacity: number;
  interviewers: { id: string; name: string }[];
  mine: boolean;
  bookings: { applicationId: string; name: string; telegramUsername: string | null }[];
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
              user: { select: { telegramUsername: true } },
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
    capacity: slot.capacity,
    interviewers: slot.interviewers.map((item) => ({ id: item.user.id, name: displayName(item.user) })),
    mine: slot.interviewers.some((item) => item.user.id === viewerId),
    bookings: slot.bookings.map((booking) => ({
      applicationId: booking.application.id,
      name: fullName(booking.application),
      telegramUsername: booking.application.user.telegramUsername,
    })),
  }));
}
