import { z } from "zod";

import { NOTE_MAX, saveNote } from "~~/lib/interviews/guide";
import { requestMeta } from "~~/server/utils/request-meta";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  questionId: z.string().min(1),
  note: z.string().max(NOTE_MAX * 2),
});

/**
 * Ячейка комментария к вопросу собеса. Пустая стирает заметку.
 * Пишет только свою: чужие видны, но закрыты.
 */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.review");
  return saveNote(
    { applicationId: body.applicationId, questionId: body.questionId, authorId: actor.id, note: body.note },
    requestMeta(event),
  );
});
