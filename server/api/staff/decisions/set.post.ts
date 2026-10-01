import { z } from "zod";

import { setDecision } from "~~/lib/applications/decisions";
import { EVALUATED_STAGES } from "~~/lib/applications/staff";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  stage: z.enum(EVALUATED_STAGES),
  outcome: z.enum(["PASSED", "REJECTED"]).nullable(),
});

/** Отметить, проходит ли кандидат дальше. До публикации — черновик. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.decide");
  const result = await setDecision(body.applicationId, body.stage, body.outcome, actor.id);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "decision.set",
    entityType: "application",
    entityId: body.applicationId,
    meta: { stage: body.stage, outcome: body.outcome },
  });
  return { ok: true };
});
