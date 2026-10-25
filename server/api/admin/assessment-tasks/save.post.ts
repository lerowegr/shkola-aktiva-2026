import { z } from "zod";

import { saveTask } from "~~/lib/assessment/notes";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().max(200),
  order: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

/** Создать задание ЦО, переименовать, переставить, выключить. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await saveTask(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: result.created ? "assessment.task.create" : "assessment.task.update",
    entityType: "assessment_task",
    entityId: result.id,
    meta: { title: body.title.trim(), order: body.order, active: body.active },
  });
  return { ok: true, id: result.id, message: result.created ? "Задание добавлено." : "Сохранено." };
});
