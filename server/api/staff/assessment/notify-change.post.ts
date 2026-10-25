import { z } from "zod";

import { notifyChange } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Сообщить приглашённым, что место или время сбора изменились. */
export default defineAction(z.object({ sessionId: z.string().min(1) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await notifyChange(await requireCurrentSeasonId(), body.sessionId);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "assessment.session.notify_change",
    entityType: "assessment_session",
    entityId: body.sessionId,
    meta: { sent: result.sent },
  });
  return { ok: true, message: `Сообщили об изменении: ${result.sent}.` };
});
