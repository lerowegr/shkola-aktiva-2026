import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Мастера отбора с нагрузкой — для выбора при переназначении. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "applications.assign");
  const seasonId = await requireCurrentSeasonId();

  const people = await db.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { permissions: { has: "applications.review" } } } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      telegramUsername: true,
      email: true,
      _count: { select: { reviews: { where: { stageKind: "APPLICATION", application: { seasonId } } } } },
    },
  });

  return {
    reviewers: people
      .map((person) => ({ id: person.id, name: displayName(person), load: person._count.reviews }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
});
