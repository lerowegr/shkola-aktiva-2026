import { displayName } from "~~/lib/auth/actor";
import { loadGroups } from "~~/lib/assessment/groups";
import { db } from "~~/lib/db";
import { can } from "~~/lib/permissions";
import { currentSeason } from "~~/lib/stages";
import { requireUser } from "~~/server/utils/session";

/**
 * Центр оценки для организатора: все группы, кандидаты без группы и кого
 * можно назначить экспертом. Эксперту без права распределения — только его
 * группы.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const manage = can(user, "applications.assign");
  if (!manage && !can(user, "applications.review")) {
    throw createError({ statusCode: 403, statusMessage: "Центр оценки — для мастеров отбора и распределяющих." });
  }

  const season = await currentSeason();
  if (!season) throw createError({ statusCode: 404, statusMessage: "Сезон ещё не заведён." });
  const stage = season.stages.find((item) => item.kind === "ASSESSMENT") ?? null;

  const [overview, people, criteria] = await Promise.all([
    loadGroups(season.id, manage ? undefined : user.id),
    manage
      ? db.user.findMany({
          where: { status: "ACTIVE", roles: { some: { role: { permissions: { has: "applications.review" } } } } },
          select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true },
        })
      : Promise.resolve([]),
    db.criterion.count({ where: { seasonId: season.id, stageKind: "ASSESSMENT" } }),
  ]);

  return {
    manage,
    me: user.id,
    stage: stage ? { title: stage.title, state: stage.state, opensAt: stage.opensAt, closesAt: stage.closesAt } : null,
    criteria,
    ...overview,
    experts: people
      .map((person) => ({ id: person.id, name: displayName(person) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
});
