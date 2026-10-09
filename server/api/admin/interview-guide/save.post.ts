import { z } from "zod";

import { saveGuideQuestion } from "~~/lib/admin/interview-guide";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  block: z.string().max(120),
  text: z.string().max(2000),
  intro: z.boolean(),
});

/** Сохранить вопрос сценария — под правом настройки анкеты. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await saveGuideQuestion(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "interview.question",
    entityType: "interview_question",
    entityId: body.id,
    meta: { block: body.block },
  });
  return { ok: true, message: "Вопрос сохранён." };
});
