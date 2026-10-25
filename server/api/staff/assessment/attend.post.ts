import { z } from "zod";

import { setAttended } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Отметка «пришёл» в день ЦО. */
export default defineAction(z.object({ applicationId: z.string().min(1), attended: z.boolean() }), async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await setAttended(await requireCurrentSeasonId(), body.applicationId, body.attended);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "assessment.attend",
    entityType: "application",
    entityId: body.applicationId,
    meta: { attended: body.attended },
  });
  return { ok: true };
});
