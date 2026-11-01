import { z } from "zod";

import { setSlotInterviewers } from "~~/lib/interviews/booking";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  slotId: z.string().min(1),
  interviewerIds: z.array(z.string().min(1)).length(1, "Выберите ровно одного мастера."),
});

/** Поменять собеседующих у готового слота. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  const result = await setSlotInterviewers(body.slotId, body.interviewerIds);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "interview.slot_interviewers",
    entityType: "slot",
    entityId: body.slotId,
    meta: { added: result.added, removed: result.removed },
  });
  return { ok: true, message: "Собеседующие сохранены." };
});
