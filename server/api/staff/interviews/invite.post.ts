import { z } from "zod";
import { sendInvitations } from "~~/lib/interviews/invitations";
import { requirePermission } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";
export default defineAction(z.object({}), async ({ event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  return sendInvitations(await requireCurrentSeasonId(), actor.id);
});
