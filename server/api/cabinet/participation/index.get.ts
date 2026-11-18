import { loadParticipation } from "~~/lib/participation/store";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  setHeader(event, "Cache-Control", "private, no-store");
  return { form: user.mustChangePassword ? null : await loadParticipation(await requireCurrentSeasonId(), user.id) };
});
