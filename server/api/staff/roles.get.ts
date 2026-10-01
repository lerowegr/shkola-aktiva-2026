import { db } from "~~/lib/db";
import { canGrantRole } from "~~/lib/permissions";
import { requirePermission } from "~~/server/utils/session";

/** Роли для формы приглашения — только те, что этот человек вправе выдать. */
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "users.manage");

  const roles = await db.role.findMany({
    orderBy: { priority: "asc" },
    select: { id: true, name: true, description: true, permissions: true },
  });

  return {
    roles: roles
      .filter((role) => canGrantRole(actor, role.permissions))
      .map(({ permissions: _permissions, ...role }) => role),
  };
});
