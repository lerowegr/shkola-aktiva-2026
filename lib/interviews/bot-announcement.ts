import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { writeAudit } from "~~/lib/audit";

const notificationKey = (seasonId: string) => `interview-bot-access:${seasonId}`;
export const BOT_INTERVIEW_ANNOUNCEMENT = "Привет! На собеседование теперь можно записаться прямо здесь, без сайта. Отправь боту !собес и выбери корпус, день и время кнопками. Если ты уже записан, в том же меню можно один раз изменить время до 18:00 по Москве накануне встречи. Новая запись закрывается в 20:00 накануне. Факультет не ограничивает выбор корпуса. Аудиторию сообщим отдельно перед встречей.";

async function audience(seasonId: string, now: Date) {
  return db.application.findMany({ where: {
    seasonId, status: "SUBMITTED", assessmentInvite: { is: { attended: true } },
    decisions: { none: { stageKind: "INTERVIEW", publishedAt: { not: null } } },
    user: { status: "ACTIVE", telegramId: { not: null }, roles: { none: {} }, notifications: { none: { key: notificationKey(seasonId) } } },
    OR: [{ bookings: { none: {} } }, { bookings: { some: { cancelledAt: null, slot: { startsAt: { gt: now } } } } }],
  }, select: { userId: true } });
}
export async function previewBotInterviewAnnouncement(seasonId: string, now = new Date()) {
  return (await audience(seasonId, now)).length;
}
export async function sendBotInterviewAnnouncement(seasonId: string, actorId: string, now = new Date()) {
  const people = await audience(seasonId, now);
  const created = await notify(people.map(person => ({ userId: person.userId, category: "SELECTION", title: "Запись на собеседование в боте", body: BOT_INTERVIEW_ANNOUNCEMENT, url: "/cabinet/interview", key: notificationKey(seasonId) })), { urgent: true, now, deliverAt: now });
  await writeAudit({ actorId, action: "interview.bot_announcement", entityType: "season", entityId: seasonId, meta: { requested: people.length, created } });
  return created;
}
