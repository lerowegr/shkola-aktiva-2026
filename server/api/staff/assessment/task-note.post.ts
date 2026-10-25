import { z } from "zod";

import { saveTaskNote, TASK_NOTE_MAX } from "~~/lib/assessment/notes";
import { requestMeta } from "~~/server/utils/request-meta";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  taskId: z.string().min(1),
  text: z.string().max(TASK_NOTE_MAX * 2),
});

/** Своя ячейка «задание ЦО × кандидат». Пустая стирает. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  return saveTaskNote(await requireCurrentSeasonId(), { ...body, authorId: actor.id }, requestMeta(event));
});
