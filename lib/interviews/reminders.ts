import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";

/**
 * Напоминания о собеседовании: за сутки и за час.
 *
 * Не по расписанию на каждую запись, а «досоздать всё, что пора»: раз в
 * минуту разносчик смотрит записи на ближайшие сутки. Ключ события
 * (booking:<id>:24h) не даёт создать второе такое же, поэтому пересчитывать
 * можно сколько угодно. За час — срочное: уходит и ночью.
 */
const HOUR = 60 * 60 * 1000;

export function dueReminders(
  bookings: readonly { id: string; startsAt: Date }[],
  now: Date,
): { bookingId: string; kind: "24h" | "1h" }[] {
  const due: { bookingId: string; kind: "24h" | "1h" }[] = [];
  for (const booking of bookings) {
    const left = booking.startsAt.getTime() - now.getTime();
    if (left <= 0) continue;
    if (left <= 24 * HOUR) due.push({ bookingId: booking.id, kind: "24h" });
    if (left <= HOUR) due.push({ bookingId: booking.id, kind: "1h" });
  }
  return due;
}

function at(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(date);
}

export async function materializeReminders(now = new Date()): Promise<void> {
  const bookings = await db.interviewBooking.findMany({
    where: { cancelledAt: null, slot: { startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } } },
    select: {
      id: true,
      application: { select: { id: true, userId: true } },
      slot: { select: { startsAt: true, location: true, interviewers: { select: { userId: true } } } },
    },
  });

  const due = dueReminders(
    bookings.map((booking) => ({ id: booking.id, startsAt: booking.slot.startsAt })),
    now,
  );
  if (due.length === 0) return;

  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  const daily = due.filter((item) => item.kind === "24h").map((item) => byId.get(item.bookingId)!);
  const hourly = due.filter((item) => item.kind === "1h").map((item) => byId.get(item.bookingId)!);

  await notify(
    daily.map((booking) => ({
      userId: booking.application.userId,
      category: "SELECTION" as const,
      title: "Завтра собеседование",
      body: `В ${at(booking.slot.startsAt)}, ${booking.slot.location}. Если не получается — перенесите в кабинете.`,
      url: "/cabinet/interview",
      key: `booking:${booking.id}:24h`,
    })),
  );

  await notify(
    hourly.flatMap((booking) => [
      {
        userId: booking.application.userId,
        category: "SELECTION" as const,
        title: "Собеседование через час",
        body: `В ${at(booking.slot.startsAt)}, ${booking.slot.location}. Ждём вас!`,
        url: "/cabinet/interview",
        key: `booking:${booking.id}:1h`,
      },
      ...booking.slot.interviewers.map((item) => ({
        userId: item.userId,
        category: "REVIEW" as const,
        title: "Собеседование через час",
        body: `В ${at(booking.slot.startsAt)}, ${booking.slot.location}`,
        url: `/staff/applications/${booking.application.id}?stage=INTERVIEW`,
        key: `booking:${booking.id}:1h`,
      })),
    ]),
    { urgent: true },
  );
}
