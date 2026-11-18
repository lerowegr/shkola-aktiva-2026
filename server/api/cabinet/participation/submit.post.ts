import { participationSchema } from "~~/lib/participation/form";
import { submitParticipation } from "~~/lib/participation/store";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireProfile } from "~~/server/utils/session";

export default defineAction(participationSchema, async ({ body, event }) => {
  const user = await requireProfile(event);
  return submitParticipation(await requireCurrentSeasonId(), user.id, body);
});
