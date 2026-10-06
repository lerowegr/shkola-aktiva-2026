import { z } from "zod";

import { saveQuizQuestion } from "~~/lib/admin/quiz";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().max(300),
  options: z.array(z.string().max(150)).max(6),
  correct: z.number().int().min(0).max(5),
  isActive: z.boolean(),
});

/** Сохранить вопрос викторины — под правом настройки анкеты. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await saveQuizQuestion(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "quiz.question",
    entityType: "question",
    entityId: body.id,
    meta: { text: body.text },
  });
  return { ok: true, message: "Вопрос сохранён." };
});
