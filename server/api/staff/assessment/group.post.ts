import { z } from "zod";

import { saveGroup } from "~~/lib/assessment/groups";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  sessionId: z.string().min(1, "Выберите сбор."),
  title: z.string().max(200),
  faculty: z.string().min(1).nullable().optional(),
});

/** Создать подгруппу сбора или переименовать. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const seasonId = await requireCurrentSeasonId();

  const result = await saveGroup(seasonId, body);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: result.created ? "assessment.group.create" : "assessment.group.update",
    entityType: "assessment_group",
    entityId: result.id,
    meta: { title: body.title.trim(), sessionId: body.sessionId, faculty: body.faculty },
  });

  return { ok: true, id: result.id, message: result.created ? "Подгруппа создана." : "Сохранено." };
});
