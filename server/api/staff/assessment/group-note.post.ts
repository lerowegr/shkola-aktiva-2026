import { z } from "zod";

import { GROUP_NOTE_MAX, saveGroupNote } from "~~/lib/assessment/notes";
import { requestMeta } from "~~/server/utils/request-meta";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ groupId: z.string().min(1), text: z.string().max(GROUP_NOTE_MAX * 2) });

/** Свой фоновый комментарий подгруппы: как идёт ЦО. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  return saveGroupNote(await requireCurrentSeasonId(), { ...body, authorId: actor.id }, requestMeta(event));
});
