import { z } from "zod";

import { transferReview } from "~~/lib/applications/review-store";
import { requestMeta } from "~~/server/utils/request-meta";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  reviewId: z.string().min(1),
  toUserId: z.string().min(1),
});

/** Передать свою оценку другому мастеру — вместе с баллами. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  const result = await transferReview({ reviewId: body.reviewId, actorId: actor.id, toUserId: body.toUserId }, requestMeta(event));
  return result.ok ? { ok: true, reviewId: result.reviewId } : result;
});
