import { z } from "zod";

import { db } from "~~/lib/db";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  body: z.string().trim().min(1, "Напишите комментарий перед сохранением.").max(1200, "Комментарий не длиннее 1200 знаков."),
});

/** Добавить внутренний комментарий к итогам, не меняя статус кандидата. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.decide");
  const application = await db.application.findFirst({
    where: { id: body.applicationId, seasonId: await requireCurrentSeasonId(), status: "SUBMITTED" },
    select: { id: true },
  });
  if (!application) return { ok: false, message: "Анкета не найдена в текущем наборе. Обновите страницу." };

  const comment = await db.finalDecisionComment.create({
    data: { applicationId: application.id, authorId: actor.id, body: body.body },
    select: { id: true },
  });
  await audit(event, {
    actorId: actor.id,
    action: "decision.comment_add",
    entityType: "application",
    entityId: application.id,
    meta: { commentId: comment.id },
  });
  return { ok: true, message: "Комментарий добавлен." };
});
