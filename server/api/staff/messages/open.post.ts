import { z } from "zod";

import { db } from "~~/lib/db";
import { threadFor } from "~~/lib/messages/threads";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ applicationId: z.string().min(1) });

/**
 * «Написать» из анкеты: ветка переписки с этим кандидатом — найти или
 * завести. Само сообщение уходит обычной отправкой из «Сообщений»: кандидату
 * на сайт и от бота ША в Telegram.
 */
export default defineAction(schema, async ({ body, event }) => {
  await requirePermission(event, "messages.reply");
  const seasonId = await requireCurrentSeasonId();
  const application = await db.application.findFirst({
    where: { id: body.applicationId, seasonId },
    select: { userId: true },
  });
  if (!application) return { ok: false, message: "Анкета не найдена — обновите страницу." };
  const thread = await threadFor(seasonId, application.userId);
  return { ok: true, threadId: thread.id };
});
