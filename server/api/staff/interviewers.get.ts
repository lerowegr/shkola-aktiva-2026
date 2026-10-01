import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { requirePermission } from "~~/server/utils/session";

/** Кого можно поставить собеседующим: мастера и ведущие собеседования. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "interviews.manage");
  const people = await db.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { some: { role: { permissions: { hasSome: ["applications.review", "interviews.manage"] } } } },
    },
    select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true },
  });
  return {
    people: people.map((person) => ({ id: person.id, name: displayName(person) })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
});
