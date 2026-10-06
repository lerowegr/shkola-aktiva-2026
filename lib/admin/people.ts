import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { canGrantRole, type Actor } from "~~/lib/permissions";

import type { AdminResult } from "./roles";

/**
 * Люди в админке: поиск, роли, блокировка.
 *
 * Выдать или снять роль можно, только если все её права есть у самого
 * действующего. Владельца не заблокировать никому: это страховка от
 * ситуации, когда в системе не осталось ни одного, кто может всё.
 * Себя тоже не заблокировать — случайно запереться снаружи слишком легко.
 */
export interface PersonRow {
  id: string;
  name: string;
  nickname: string | null;
  email: string | null;
  telegramUsername: string | null;
  blocked: boolean;
  isOwner: boolean;
  hasPassword: boolean;
  hasTelegram: boolean;
  roles: { id: string; name: string }[];
  application: "none" | "draft" | "submitted";
}

export async function searchPeople(params: {
  query: string;
  scope: "staff" | "all";
  limit?: number;
}): Promise<PersonRow[]> {
  const q = params.query.trim().replace(/^@/, "");
  const people = await db.user.findMany({
    where: {
      ...(params.scope === "staff" ? { OR: [{ isOwner: true }, { roles: { some: {} } }] } : {}),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                  { email: { contains: q, mode: "insensitive" as const } },
                  { telegramUsername: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: params.limit ?? 100,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      telegramUsername: true,
      telegramId: true,
      status: true,
      isOwner: true,
      passwordHash: true,
      roles: { select: { role: { select: { id: true, name: true, priority: true } } } },
      applications: { where: { season: { isCurrent: true } }, select: { status: true } },
    },
  });

  return people.map((person) => ({
    id: person.id,
    name: displayName(person),
    nickname: person.nickname,
    email: person.email,
    telegramUsername: person.telegramUsername,
    blocked: person.status === "BLOCKED",
    isOwner: person.isOwner,
    hasPassword: person.passwordHash !== null,
    hasTelegram: person.telegramId !== null,
    roles: person.roles
      .sort((a, b) => b.role.priority - a.role.priority)
      .map((item) => ({ id: item.role.id, name: item.role.name })),
    application: !person.applications[0]
      ? "none"
      : person.applications[0].status === "SUBMITTED"
        ? "submitted"
        : "draft",
  }));
}

export async function grantRole(actor: Actor & { id: string }, userId: string, roleId: string): Promise<AdminResult> {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true, permissions: true } });
  if (!role) return { ok: false, message: "Роль не найдена — обновите страницу." };
  if (!canGrantRole(actor, role.permissions)) {
    return { ok: false, message: `Роль «${role.name}» сильнее ваших прав — её выдаёт тех.админ.` };
  }
  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId, assignedById: actor.id },
    update: {},
  });
  return { ok: true };
}

export async function revokeRole(actor: Actor, userId: string, roleId: string): Promise<AdminResult> {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true, permissions: true } });
  if (!role) return { ok: false, message: "Роль не найдена — обновите страницу." };
  if (!canGrantRole(actor, role.permissions)) {
    return { ok: false, message: `Роль «${role.name}» сильнее ваших прав — снять её может тех.админ.` };
  }
  await db.userRole.deleteMany({ where: { userId, roleId } });
  return { ok: true };
}

export async function setBlocked(actor: { id: string }, userId: string, blocked: boolean): Promise<AdminResult> {
  if (userId === actor.id) return { ok: false, message: "Себя заблокировать нельзя." };
  const target = await db.user.findUnique({ where: { id: userId }, select: { isOwner: true } });
  if (!target) return { ok: false, message: "Человек не найден." };
  if (target.isOwner) return { ok: false, message: "Владельца системы заблокировать нельзя." };

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { status: blocked ? "BLOCKED" : "ACTIVE" } }),
    // Открытые вкладки заблокированного перестают работать сразу.
    ...(blocked ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);
  return { ok: true };
}
