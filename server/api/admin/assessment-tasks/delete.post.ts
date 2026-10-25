import { z } from "zod";

import { deleteTask } from "~~/lib/assessment/notes";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Удалить задание ЦО, если к нему ещё нет комментариев. */
export default defineAction(z.object({ id: z.string().min(1) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await deleteTask(await requireCurrentSeasonId(), body.id);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "assessment.task.delete", entityType: "assessment_task", entityId: body.id, meta: { title: result.title } });
  return { ok: true, message: "Задание удалено." };
});
