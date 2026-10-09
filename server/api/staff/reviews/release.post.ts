import { z } from "zod";

import { releaseReview } from "~~/lib/applications/review-store";
import { requestMeta } from "~~/server/utils/request-meta";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  reviewId: z.string().min(1),
  keep: z.boolean(),
});

/** Вернуть оценку на биржу: с сохранением (заморозка) или без (удаление). */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  return releaseReview({ reviewId: body.reviewId, actorId: actor.id, keep: body.keep }, requestMeta(event));
});
