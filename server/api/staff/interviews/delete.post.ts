import { z } from "zod";

import { deleteSlot } from "~~/lib/interviews/slots";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ slotId: z.string().min(1) });

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  const result = await deleteSlot(body.slotId);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "interview.slot_delete", entityType: "slot", entityId: body.slotId });
  return { ok: true };
});
