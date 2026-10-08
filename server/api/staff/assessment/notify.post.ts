import { z } from "zod";

import { notifyGroup } from "~~/lib/assessment/groups";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ groupId: z.string().min(1) });

/** Сообщить кандидатам группы корпус, аудиторию и время. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await notifyGroup(await requireCurrentSeasonId(), body.groupId);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "assessment.notify",
    entityType: "assessment_group",
    entityId: body.groupId,
    meta: { title: result.title, sent: result.sent, repeat: result.repeat },
  });
  return { ok: true, message: result.repeat ? "Группе сообщили об изменении." : "Группе сообщили место и время." };
});
