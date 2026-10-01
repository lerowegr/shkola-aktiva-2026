import { z } from "zod";

import { db } from "~~/lib/db";
import { MESSAGE_MAX, postMessage } from "~~/lib/messages/threads";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  threadId: z.string().min(1),
  text: z.string().trim().min(1, "Напишите сообщение.").max(MESSAGE_MAX, `Не длиннее ${MESSAGE_MAX} знаков.`),
});

/**
 * Ответ кандидату. На сайте он появляется сразу, в Telegram его приносит
 * бот — через минуту, если кандидат не прочитал раньше на сайте.
 * Запись в переписке с автором и есть журнал: отдельный аудит не нужен.
 */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "messages.reply");
  const thread = await db.messageThread.findUnique({ where: { id: body.threadId }, select: { id: true } });
  if (!thread) return { ok: false, message: "Переписка не найдена — обновите страницу." };

  await postMessage({ threadId: thread.id, author: "STAFF", authorId: actor.id, text: body.text, via: "SITE" });
  return { ok: true };
});
