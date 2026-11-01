import { z } from "zod";
import { restoreSlot } from "~~/lib/interviews/manage";
import { requirePermission } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";
export default defineAction(z.object({ slotId: z.string().min(1) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  return restoreSlot(actor.id, await requireCurrentSeasonId(), body.slotId);
});
