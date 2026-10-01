import { z } from "zod";

import { saveText, TEXT_MAX } from "~~/lib/applications/review-store";
import { requestMeta } from "~~/server/utils/request-meta";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  reviewId: z.string().min(1),
  /** "comment" или id маркера. */
  field: z.string().min(1),
  value: z.string().max(TEXT_MAX, `Не длиннее ${TEXT_MAX} знаков — сократите текст.`),
});

/** Маркер или комментарий — сохраняется на паузе в наборе. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  const result = await saveText({ ...body, actorId: actor.id }, requestMeta(event));
  return result.ok ? { ok: true, updatedAt: result.updatedAt.toISOString() } : result;
});
