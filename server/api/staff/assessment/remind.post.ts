import { z } from "zod";

import { remindSession } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Напомнить неответившим. */
export default defineAction(z.object({ sessionId: z.string().min(1) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await remindSession(await requireCurrentSeasonId(), body.sessionId);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "assessment.session.remind",
    entityType: "assessment_session",
    entityId: body.sessionId,
    meta: { reminded: result.reminded },
  });
  return { ok: true, message: `Напомнили: ${result.reminded}.` };
});
