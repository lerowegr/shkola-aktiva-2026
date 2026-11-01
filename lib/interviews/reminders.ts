import { db } from "~~/lib/db";
import { changeDeadline, interviewPlace } from "./rules";
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
    where: { cancelledAt: null, slot: { startsAt: { gt: now, lte: new Date(now.getTime() + 36 * HOUR) } } },
    select: {
      id: true,
      application: { select: { id: true, userId: true, interviewReschedulesUsed: true, assessmentInvite: { select: { attended: true } } } },
      slot: { select: { startsAt: true, location: true, room: true, interviewers: { select: { userId: true } } } },
    },
  });

  const deadlineBookings = bookings.filter(booking => {
    const deadline = changeDeadline(booking.slot.startsAt).getTime();
    return booking.application.assessmentInvite?.attended === true && booking.application.interviewReschedulesUsed < 1 && now.getTime() >= deadline - 2 * HOUR && now.getTime() < deadline;
  });
  await notify(deadlineBookings.map(booking => ({
    userId: booking.application.userId, category: "SELECTION" as const,
    title: "Перезапись на собеседование — до 18:00 сегодня",
    body: "Если хотите выбрать другое время, сделайте это в кабинете до 18:00 по Москве. Самостоятельная перезапись доступна один раз. После 18:00 перенос возможен только через организаторов.",
    url: "/cabinet/interview", key: `booking:${booking.id}:change-deadline`,
  })), { urgent: true });

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
      title: "Напоминание о собеседовании",
      body: `${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long" }).format(booking.slot.startsAt)}, в ${at(booking.slot.startsAt)}, ${interviewPlace(booking.slot)}.`,
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
        body: `В ${at(booking.slot.startsAt)}, ${interviewPlace(booking.slot)}. Ждём вас!`,
        url: "/cabinet/interview",
        key: `booking:${booking.id}:1h`,
      },
      ...booking.slot.interviewers.map((item) => ({
        userId: item.userId,
        category: "REVIEW" as const,
        title: "Собеседование через час",
        body: `В ${at(booking.slot.startsAt)}, ${interviewPlace(booking.slot)}`,
        url: `/staff/applications/${booking.application.id}?stage=INTERVIEW`,
        key: `booking:${booking.id}:1h`,
      })),
    ]),
    { urgent: true },
  );
}

/** Очередь могла задержать доставку: устаревший дедлайн или отменённую запись не отправляем. */
export async function interviewReminderIsCurrent(key: string | null, now: Date): Promise<boolean> {
  const match = key?.match(/^booking:([^:]+):(24h|1h|change-deadline)$/);
  if (!match) return true;
  const booking = await db.interviewBooking.findUnique({ where: { id: match[1]! }, select: { cancelledAt: true, slot: { select: { startsAt: true } }, application: { select: { interviewReschedulesUsed: true, assessmentInvite: { select: { attended: true } } } } } });
  if (!booking || booking.cancelledAt || booking.slot.startsAt <= now) return false;
  if (match[2] !== "change-deadline") return true;
  const deadline = changeDeadline(booking.slot.startsAt).getTime();
  return booking.application.assessmentInvite?.attended === true && booking.application.interviewReschedulesUsed < 1 && now.getTime() >= deadline - 2 * HOUR && now.getTime() < deadline;
}
