import { z } from "zod";

import { saveMarker } from "~~/lib/admin/forms";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  stage: z.enum(["APPLICATION", "HOMEWORK", "INTERVIEW"]),
  title: z.string().max(100),
  example: z.string().max(500).nullable(),
});

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await saveMarker(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "form.marker", entityType: "marker", entityId: body.id, meta: { stage: body.stage, title: body.title } });
  return { ok: true, message: "Маркер сохранён." };
});
