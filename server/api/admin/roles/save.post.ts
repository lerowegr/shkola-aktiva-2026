import { z } from "zod";

import { saveRole } from "~~/lib/admin/roles";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Назовите роль.").max(60),
  description: z.string().max(300).nullable(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
  permissions: z.array(z.string()).max(50),
});

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "roles.manage");
  const result = await saveRole(actor, body);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "role.save", entityType: "role", entityId: result.id, meta: { name: body.name, permissions: body.permissions } });
  return { ok: true, message: "Роль сохранена." };
});
