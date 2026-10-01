import { z } from "zod";

import { deleteRole, roleName } from "~~/lib/admin/roles";
import { requirePermission } from "~~/server/utils/session";

export default defineAction(z.object({ id: z.string().min(1) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "roles.manage");
  const name = await roleName(body.id);
  const result = await deleteRole(actor, body.id);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "role.delete", entityType: "role", entityId: body.id, meta: { name } });
  return { ok: true, message: "Роль удалена." };
});
