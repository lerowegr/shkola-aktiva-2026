import { z } from "zod";
import { nonAttendanceReport } from "~~/lib/assessment/non-attendance";
import { canAny } from "~~/lib/permissions";
import { parseFacultyFilter } from "~~/lib/profile/faculty";
import { requireUser } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";

export default defineEventHandler(async event => {
  const actor = await requireUser(event);
  if (!canAny(actor, ["applications.assign", "applications.view_all"])) throw createError({ statusCode: 403, statusMessage: "Список доступен организаторам с просмотром всех анкет или распределением." });
  const { faculty } = z.object({ faculty: z.string().max(20).default("") }).parse(getQuery(event));
  return nonAttendanceReport(await requireCurrentSeasonId(), parseFacultyFilter(faculty));
});
