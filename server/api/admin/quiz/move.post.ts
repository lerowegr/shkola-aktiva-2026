import { z } from "zod";

import { moveQuizQuestion } from "~~/lib/admin/quiz";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ id: z.string().min(1), dir: z.enum(["up", "down"]) });

export default defineAction(schema, async ({ body, event }) => {
  await requirePermission(event, "forms.manage");
  return moveQuizQuestion(await requireCurrentSeasonId(), body.id, body.dir);
});
