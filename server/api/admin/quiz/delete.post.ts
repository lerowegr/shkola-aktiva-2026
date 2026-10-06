import { z } from "zod";

import { deleteQuizQuestion } from "~~/lib/admin/quiz";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ id: z.string().min(1) });

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await deleteQuizQuestion(await requireCurrentSeasonId(), body.id);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "quiz.delete", entityType: "question", entityId: body.id });
  return { ok: true, message: "Вопрос удалён." };
});
