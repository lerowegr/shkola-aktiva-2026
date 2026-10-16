import { reviewSummary } from "~~/lib/applications/review";
import { db } from "~~/lib/db";
import { currentSeason } from "~~/lib/stages";
import { requireUser } from "~~/server/utils/session";

const STAGES = ["APPLICATION", "HOMEWORK", "ASSESSMENT", "INTERVIEW"] as const;

/** Личный кабинет организатора: кто я, как вхожу, моя работа в сезоне. */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event);
  if (!me.isStaff) throw createError({ statusCode: 403, statusMessage: "Кабинет только для организаторов." });

  const season = await currentSeason();
  const [user, reviews, criteria, interviews] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: me.id },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        login: true,
        telegramUsername: true,
        telegramId: true,
        passwordSetAt: true,
        isOwner: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true, color: true } } } },
      },
    }),
    season
      ? db.review.findMany({
          where: { reviewerId: me.id, application: { seasonId: season.id } },
          select: { stageKind: true, scores: { select: { criterionId: true, score: true } } },
        })
      : Promise.resolve([]),
    season ? db.criterion.findMany({ where: { seasonId: season.id }, select: { id: true, stageKind: true, maxScore: true } }) : Promise.resolve([]),
    db.slotInterviewer.count({ where: { userId: me.id, slot: { startsAt: { gt: new Date() } } } }),
  ]);

  const work = STAGES.map((stage) => {
    const mine = reviews.filter((review) => review.stageKind === stage);
    const stageCriteria = criteria.filter((criterion) => criterion.stageKind === stage);
    return {
      stage,
      assigned: mine.length,
      done: mine.filter((review) => reviewSummary(stageCriteria, review.scores).status === "done").length,
    };
  }).filter((row) => row.assigned > 0);

  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email,
    login: user.login,
    telegram: { linked: user.telegramId !== null, username: user.telegramUsername },
    passwordSetAt: user.passwordSetAt,
    isOwner: user.isOwner,
    since: user.createdAt,
    roles: user.roles.map((item) => item.role),
    work,
    interviews,
  };
});
