import { z } from "zod";

import { grantRole } from "~~/lib/admin/people";
import { roleName } from "~~/lib/admin/roles";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ userId: z.string().min(1), roleId: z.string().min(1) });

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");
  const result = await grantRole(actor, body.userId, body.roleId);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "role.grant", entityType: "user", entityId: body.userId, meta: { roleId: body.roleId, name: await roleName(body.roleId) } });
  return { ok: true };
});
