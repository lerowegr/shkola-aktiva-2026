import { listRoles } from "~~/lib/admin/roles";
import { PERMISSION_GROUPS, canAny, canGrantRole } from "~~/lib/permissions";
import { requireUser } from "~~/server/utils/session";

/** Роли и полный список прав — для страницы ролей и выдачи ролей людям. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  if (!canAny(user, ["roles.manage", "users.manage"])) {
    throw createError({ statusCode: 403, statusMessage: "Роли вам недоступны." });
  }
  const roles = await listRoles();
  return {
    groups: PERMISSION_GROUPS,
    roles: roles.map((role) => ({ ...role, grantable: canGrantRole(user, role.permissions) })),
  };
});
