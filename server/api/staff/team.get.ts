import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { requirePermission } from "~~/server/utils/session";

/** Организаторы: у кого есть хоть одна роль, и владельцы. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "users.manage");

  const people = await db.user.findMany({
    where: { OR: [{ isOwner: true }, { roles: { some: {} } }] },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      telegramUsername: true,
      email: true,
      status: true,
      isOwner: true,
      passwordHash: true,
      telegramId: true,
      roles: { select: { role: { select: { name: true, priority: true } } } },
    },
  });

  return {
    people: people
      .map((person) => ({
        id: person.id,
        name: displayName(person),
        email: person.email,
        blocked: person.status === "BLOCKED",
        isOwner: person.isOwner,
        // Вход — через Telegram или по паролю: без того и другого человек не войдёт.
        hasPassword: person.passwordHash !== null,
        hasTelegram: person.telegramId !== null,
        roles: person.roles.sort((a, b) => b.role.priority - a.role.priority).map((item) => item.role.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
});
