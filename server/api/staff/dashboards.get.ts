import { z } from "zod";
import { parseFacultyFilter } from "~~/lib/profile/faculty";
import { assessmentReport, interviewsReport, breakdowns, channels, daily, funnel, stageStats } from "~~/lib/dashboards";
import { gamesActivity } from "~~/lib/games/results";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Все цифры дашборда одним запросом: страница открывается целиком, без мигания по кускам. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "dashboards.view");
  const params = z.object({
    faculty: z.string().max(20).default(""),
    assessmentDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
    interviewDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  }).parse(getQuery(event));
  const filters = { ...params, faculty: parseFacultyFilter(params.faculty) };
  const seasonId = await requireCurrentSeasonId();

  const [steps, days, application, homework, interview, cuts, delivery, games, assessment, interviews] = await Promise.all([
    funnel(seasonId),
    daily(seasonId),
    stageStats(seasonId, "APPLICATION"),
    stageStats(seasonId, "HOMEWORK"),
    stageStats(seasonId, "INTERVIEW"),
    breakdowns(seasonId),
    channels(),
    gamesActivity(),
    assessmentReport(seasonId, filters),
    interviewsReport(seasonId, filters),
  ]);

  return {
    funnel: steps,
    daily: days,
    stages: { APPLICATION: application, HOMEWORK: homework, INTERVIEW: interview },
    breakdowns: cuts,
    channels: delivery,
    games,
    assessment,
    interviews,
  };
});
