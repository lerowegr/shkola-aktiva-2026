import { z } from "zod";

import { FINAL_STAGE, setDecision } from "~~/lib/applications/decisions";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  outcome: z.enum(["PASSED", "REJECTED"]).nullable(),
});

/** Итог отбора кандидата: проходит в Школу или нет. До публикации — черновик. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.decide");
  const result = await setDecision(body.applicationId, FINAL_STAGE, body.outcome, actor.id);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "decision.set",
    entityType: "application",
    entityId: body.applicationId,
    meta: { stage: FINAL_STAGE, outcome: body.outcome },
  });
  return { ok: true };
});
