import { z } from "zod";
import { importSchedule } from "~~/lib/interviews/import-schedule";
import { requirePermission } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";

export default defineAction(z.object({
  preview: z.boolean(),
  rows: z.array(z.object({ date: z.string().max(10), from: z.string().max(5), to: z.string().max(5), location: z.string().trim().min(1).max(300), interviewerId: z.string().min(1).max(100) })).min(1).max(500),
}), async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  return importSchedule({ ...body, actorId: actor.id, seasonId: await requireCurrentSeasonId() });
});
