import { z } from "zod";
import { updateRoom } from "~~/lib/interviews/manage";
import { can } from "~~/lib/permissions";
import { requireUser } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requestMeta } from "~~/server/utils/request-meta";

export default defineAction(z.object({ slotId: z.string().min(1), room: z.string().trim().max(100).nullable() }), async ({ body, event }) => {
  const actor = await requireUser(event);
  if (!can(actor, "interviews.manage") && !can(actor, "applications.review")) throw createError({ statusCode: 403, statusMessage: "Нет доступа к изменению аудитории." });
  return updateRoom(actor.id, await requireCurrentSeasonId(), body.slotId, body.room, requestMeta(event));
});
