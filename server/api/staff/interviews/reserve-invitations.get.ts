import { previewReserveInvitations } from "~~/lib/interviews/reserve-invitations";
import { requirePermission } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";
export default defineEventHandler(async event => {
  await requirePermission(event, "interviews.manage");
  return previewReserveInvitations(await requireCurrentSeasonId());
});
