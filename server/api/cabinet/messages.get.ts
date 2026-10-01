import { db } from "~~/lib/db";
import { loadMessages, markThreadRead } from "~~/lib/messages/threads";
import { requireUser } from "~~/server/utils/session";

/** Переписка кандидата с организаторами. Открыл — значит, прочитал. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const season = await db.season.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!season) return { messages: [], telegram: user.hasTelegram };

  const thread = await db.messageThread.findUnique({
    where: { seasonId_candidateId: { seasonId: season.id, candidateId: user.id } },
    select: { id: true },
  });
  if (!thread) return { messages: [], telegram: user.hasTelegram };

  await markThreadRead(thread.id, "candidate");
  // Открыл переписку — уведомления о ней прочитаны: не висят в колокольчике
  // и не уйдут через минуту дублем в Telegram.
  await db.notification.updateMany({
    where: { userId: user.id, category: "MESSAGES", readAt: null },
    data: { readAt: new Date() },
  });
  return { messages: await loadMessages(thread.id), telegram: user.hasTelegram };
});
