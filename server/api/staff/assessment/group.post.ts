import { z } from "zod";

import { saveGroup } from "~~/lib/assessment/groups";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().max(200),
  building: z.string().max(200).default(""),
  room: z.string().max(200).default(""),
  startsAt: z.iso.datetime({ offset: true, error: "Дата и время указаны неверно." }).nullable().default(null),
  note: z.string().max(1000).default(""),
});

/** Создать группу или поправить место и время. */
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
    meta: { title: body.title.trim(), building: body.building.trim(), room: body.room.trim(), startsAt: body.startsAt },
  });

  return { ok: true, id: result.id, message: result.created ? "Группа создана." : "Сохранено." };
});
