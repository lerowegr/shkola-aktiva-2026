import { z } from "zod";
import { scheduleReserveInvitations } from "~~/lib/interviews/reserve-invitations";
import { requirePermission } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";
export default defineAction(z.object({ sendAt: z.string().datetime({ offset: true }) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  return scheduleReserveInvitations(await requireCurrentSeasonId(), actor.id, new Date(body.sendAt));
});
