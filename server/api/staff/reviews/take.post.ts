import { z } from "zod";

import { takeReview } from "~~/lib/applications/review-store";
import { EVALUATED_STAGES } from "~~/lib/applications/staff";
import { requestMeta } from "~~/server/utils/request-meta";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  stage: z.enum(EVALUATED_STAGES).default("APPLICATION"),
});

/** Взять анкету на проверку: бронь за мастером. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  const result = await takeReview(
    { applicationId: body.applicationId, stageKind: body.stage, actorId: actor.id },
    requestMeta(event),
  );
  return result.ok ? { ok: true, reviewId: result.reviewId } : result;
});
