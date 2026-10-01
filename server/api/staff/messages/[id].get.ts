import { displayName } from "~~/lib/auth/actor";
import { fullName } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";
import { loadMessages, markThreadRead } from "~~/lib/messages/threads";
import { requirePermission } from "~~/server/utils/session";

/** Одна ветка: кто кандидат и вся переписка. Открыл — прочитал за всех. */
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "messages.reply");
  const id = getRouterParam(event, "id") ?? "";

  const thread = await db.messageThread.findUnique({
    where: { id },
    select: {
      id: true,
      seasonId: true,
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          telegramUsername: true,
          telegramId: true,
          email: true,
          applications: { select: { id: true, seasonId: true, status: true, lastName: true, firstName: true, middleName: true } },
        },
      },
    },
  });
  if (!thread) throw createError({ statusCode: 404, statusMessage: "Переписка не найдена." });

  await markThreadRead(thread.id, "staff");
  await db.notification.updateMany({
    where: { userId: actor.id, url: `/staff/messages?thread=${thread.id}`, readAt: null },
    data: { readAt: new Date() },
  });
  const application = thread.candidate.applications.find((item) => item.seasonId === thread.seasonId);

  return {
    id: thread.id,
    name: application?.lastName ? fullName(application) : displayName(thread.candidate),
    telegramUsername: thread.candidate.telegramUsername,
    hasTelegram: thread.candidate.telegramId !== null,
    application: application ? { id: application.id, status: application.status } : null,
    messages: await loadMessages(thread.id),
  };
});
