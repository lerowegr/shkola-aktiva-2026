import { z } from "zod";

import { moveGuideQuestion } from "~~/lib/admin/interview-guide";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ id: z.string().min(1), dir: z.enum(["up", "down"]) });

export default defineAction(schema, async ({ body, event }) => {
  await requirePermission(event, "forms.manage");
  return moveGuideQuestion(await requireCurrentSeasonId(), body.id, body.dir);
});
