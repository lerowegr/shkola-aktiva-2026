import { z } from "zod";

import { itemTitle, move } from "~~/lib/admin/forms";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  kind: z.enum(["question", "criterion", "marker", "section"]),
  id: z.string().min(1),
  direction: z.union([z.literal(-1), z.literal(1)]),
});

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await move(body.kind, body.id, body.direction);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "form.move",
    entityType: body.kind,
    entityId: body.id,
    meta: { title: await itemTitle(body.kind, body.id), direction: body.direction },
  });
  return { ok: true };
});
