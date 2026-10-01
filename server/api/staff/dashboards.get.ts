import { breakdowns, channels, daily, funnel, stageStats } from "~~/lib/dashboards";
import { gamesActivity } from "~~/lib/games/results";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Все цифры дашборда одним запросом: страница открывается целиком, без мигания по кускам. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "dashboards.view");
  const seasonId = await requireCurrentSeasonId();

  const [steps, days, application, homework, interview, cuts, delivery, games] = await Promise.all([
    funnel(seasonId),
    daily(seasonId),
    stageStats(seasonId, "APPLICATION"),
    stageStats(seasonId, "HOMEWORK"),
    stageStats(seasonId, "INTERVIEW"),
    breakdowns(seasonId),
    channels(),
    gamesActivity(),
  ]);

  return {
    funnel: steps,
    daily: days,
    stages: { APPLICATION: application, HOMEWORK: homework, INTERVIEW: interview },
    breakdowns: cuts,
    channels: delivery,
    games,
  };
});
