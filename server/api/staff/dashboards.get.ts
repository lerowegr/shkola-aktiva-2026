import { z } from "zod";
import { db } from "~~/lib/db";
import { parseFacultyFilter } from "~~/lib/profile/faculty";
import {
  assessmentReport,
  breakdowns,
  masterInterviewsByDay,
  milestonesByDay,
  staffMasters,
  channels,
  daily,
  deliveries,
  engagement,
  facultyOutcomes,
  finalScores,
  freeSeats,
  funnel,
  interviewsReport,
  messageBacklog,
  notBooked,
  reviewerAgreement,
  scoreGaps,
  speed,
  stageStats,
  todayBoard,
} from "~~/lib/dashboards";
import { gamesActivity } from "~~/lib/games/results";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Все цифры дашборда одним запросом: страница открывается целиком, без мигания по кускам. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "dashboards.view");
  const params = z
    .object({
      faculty: z.string().max(20).default(""),
      course: z.string().max(8).default(""),
      source: z.string().max(80).default(""),
      assessmentDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
      interviewDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
      building: z.string().max(100).default(""),
      master: z.string().cuid().or(z.literal("")).default(""),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
    })
    .parse(getQuery(event));
  const faculty = parseFacultyFilter(params.faculty);
  const seasonId = await requireCurrentSeasonId();

  const slice = { faculty, course: params.course || undefined, source: params.source || undefined };
  const reportFilters = { faculty, assessmentDay: params.assessmentDay, interviewDay: params.interviewDay };
  const now = new Date();

  const [
    steps,
    days,
    application,
    homework,
    interview,
    cuts,
    delivery,
    games,
    assessment,
    interviews,
    today,
    seats,
    backlog,
    agreement,
    processing,
    gaps,
    final,
    faculties,
    waiting,
    deliveriesReport,
    activity,
    milestones,
    masters,
    masterDays,
    sourceQuestion,
  ] = await Promise.all([
    funnel(seasonId, slice),
    daily(seasonId),
    stageStats(seasonId, "APPLICATION"),
    stageStats(seasonId, "HOMEWORK"),
    stageStats(seasonId, "INTERVIEW"),
    breakdowns(seasonId),
    channels(),
    gamesActivity(),
    assessmentReport(seasonId, reportFilters, now),
    interviewsReport(seasonId, reportFilters),
    todayBoard(seasonId, { faculty, day: params.day || undefined }, now),
    freeSeats(seasonId, { faculty }),
    messageBacklog(seasonId, { faculty }, now),
    reviewerAgreement(seasonId),
    speed(seasonId),
    scoreGaps(seasonId, slice),
    finalScores(seasonId, slice),
    facultyOutcomes(seasonId, { course: params.course || undefined }),
    notBooked(seasonId, { faculty }, now),
    deliveries(seasonId, 14, now),
    engagement(seasonId, now),
    milestonesByDay(
      seasonId,
      {
        faculty,
        course: params.course || undefined,
        building: params.building || undefined,
      },
      params.from ? new Date(`${params.from}T00:00:00+03:00`) : new Date(now.getTime() - 30 * 86400000),
      params.to ? new Date(`${params.to}T23:59:59+03:00`) : now,
    ),
    staffMasters(seasonId),
    params.master
      ? masterInterviewsByDay(
          seasonId,
          params.master,
          params.from ? new Date(`${params.from}T00:00:00+03:00`) : new Date(now.getTime() - 30 * 86400000),
          params.to ? new Date(`${params.to}T23:59:59+03:00`) : now,
        )
      : Promise.resolve([]),
    db.formQuestion.findFirst({
      where: { seasonId, stageKind: "APPLICATION", label: { contains: "узнал", mode: "insensitive" } },
      select: { options: true },
    }),
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
    today,
    seats,
    backlog,
    agreement,
    speed: processing,
    gaps: gaps.rows,
    final,
    faculties,
    waiting,
    deliveries: deliveriesReport,
    activity,
    sourceOptions: sourceQuestion?.options ?? [],
    milestones,
    masters,
    masterDays,
  };
});
