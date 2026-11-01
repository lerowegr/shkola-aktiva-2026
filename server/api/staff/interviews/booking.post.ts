import { z } from "zod";
import { manageBooking } from "~~/lib/interviews/manage";
import { requirePermission } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requestMeta } from "~~/server/utils/request-meta";

export default defineAction(z.object({ applicationId: z.string().min(1), slotId: z.string().min(1).nullable(), restoreChange: z.boolean().default(false) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  return manageBooking({ ...body, actorId: actor.id, seasonId: await requireCurrentSeasonId() }, requestMeta(event));
});
