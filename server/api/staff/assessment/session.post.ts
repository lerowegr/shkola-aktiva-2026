import { z } from "zod";

import { saveSession } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().max(200),
  building: z.string().max(200).default(""),
  room: z.string().max(200).default(""),
  startsAt: z.iso.datetime({ offset: true, error: "Укажите дату и время сбора." }),
  note: z.string().max(1000).default(""),
  faculties: z.array(z.string().max(20)).max(20).default([]),
  reserve: z.boolean().default(false),
});

/** Создать сбор ЦО или поправить его. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await saveSession(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: result.created ? "assessment.session.create" : "assessment.session.update",
    entityType: "assessment_session",
    entityId: result.id,
    meta: { title: body.title.trim(), startsAt: body.startsAt, building: body.building.trim(), room: body.room.trim(), faculties: body.faculties, reserve: body.reserve },
  });
  return { ok: true, id: result.id, message: result.created ? "Сбор создан. Теперь пригласите кандидатов." : "Сохранено." };
});
