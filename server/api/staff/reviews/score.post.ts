import { z } from "zod";

import { saveScore } from "~~/lib/applications/review-store";
import { requestMeta } from "~~/server/utils/request-meta";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  reviewId: z.string().min(1),
  criterionId: z.string().min(1),
  score: z.number().int().nullable(),
});

/** Балл по критерию. Нажали цифру — сохранилось. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  const result = await saveScore({ ...body, actorId: actor.id }, requestMeta(event));
  return result.ok ? { ok: true, updatedAt: result.updatedAt.toISOString() } : result;
});
