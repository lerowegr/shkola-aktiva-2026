import { randomBytes } from "node:crypto";

import { db } from "~~/lib/db";
import { canGrantRole, sanitizePermissions, type Actor } from "~~/lib/permissions";

/**
 * Роли в админке.
 *
 * Править роль можно, только если все её права — и прежние, и новые — есть
 * у самого правящего. Иначе главный организатор с правом «настраивать
 * роли» мог бы и выдать себе лишнее, и урезать роль тех.админа.
 */
export type AdminResult = { ok: true } | { ok: false; message: string };

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  permissions: string[];
  isSystem: boolean;
  people: number;
}

export async function listRoles(): Promise<RoleRow[]> {
  const roles = await db.role.findMany({
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      permissions: true,
      isSystem: true,
      _count: { select: { users: true } },
    },
  });
  return roles.map(({ _count, ...role }) => ({ ...role, people: _count.users }));
}

export async function saveRole(
  actor: Actor,
  input: { id?: string; name: string; description: string | null; color: string | null; permissions: string[] },
): Promise<AdminResult & { id?: string }> {
  const permissions = sanitizePermissions(input.permissions);
  const name = input.name.trim();
  if (!name) return { ok: false, message: "Назовите роль." };

  if (!canGrantRole(actor, permissions)) {
    return { ok: false, message: "В роли есть права, которых нет у вас. Такую роль настраивает тех.админ." };
  }

  if (input.id) {
    const current = await db.role.findUnique({ where: { id: input.id }, select: { permissions: true } });
    if (!current) return { ok: false, message: "Роль не найдена — обновите страницу." };
    if (!canGrantRole(actor, current.permissions)) {
      return { ok: false, message: "Эта роль сильнее ваших прав — её настраивает тех.админ." };
    }
  }

  try {
    const role = input.id
      ? await db.role.update({
          where: { id: input.id },
          data: { name, description: input.description?.trim() || null, color: input.color, permissions },
          select: { id: true },
        })
      : await db.role.create({
          data: {
            name,
            // Адрес роли нигде не показывается — достаточно уникального.
            slug: `role-${randomBytes(4).toString("hex")}`,
            description: input.description?.trim() || null,
            color: input.color,
            permissions,
          },
          select: { id: true },
        });
    return { ok: true, id: role.id };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, message: "Роль с таким названием уже есть." };
    throw error;
  }
}

/** Название роли — для журнала. */
export async function roleName(id: string): Promise<string | null> {
  return (await db.role.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

export async function deleteRole(actor: Actor, id: string): Promise<AdminResult> {
  const role = await db.role.findUnique({
    where: { id },
    select: { isSystem: true, permissions: true, _count: { select: { users: true } } },
  });
  if (!role) return { ok: false, message: "Роль не найдена — обновите страницу." };
  if (role.isSystem) return { ok: false, message: "Системную роль удалить нельзя — только переименовать." };
  if (role._count.users > 0) return { ok: false, message: "Роль выдана людям. Сначала снимите её у всех." };
  if (!canGrantRole(actor, role.permissions)) return { ok: false, message: "Эта роль сильнее ваших прав." };

  await db.role.delete({ where: { id } });
  return { ok: true };
}
