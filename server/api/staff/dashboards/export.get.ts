import { z } from "zod";
import { DASHBOARD_REPORTS, dashboardCsv } from "~~/lib/dashboards-export";
import { parseFacultyFilter } from "~~/lib/profile/faculty";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** CSV любого дашборда: тот же отчёт, что на экране, файлом для Excel. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "dashboards.view");
  const parsed = z
    .object({
      report: z.enum(Object.keys(DASHBOARD_REPORTS) as [keyof typeof DASHBOARD_REPORTS, ...(keyof typeof DASHBOARD_REPORTS)[]]),
      faculty: z.string().max(20).default(""),
      course: z.string().max(8).default(""),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
    })
    .safeParse(getQuery(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: "Неизвестный отчёт" });
  const query = parsed.data;
  const seasonId = await requireCurrentSeasonId();
  const file = await dashboardCsv(seasonId, query.report, {
    faculty: parseFacultyFilter(query.faculty),
    course: query.course || undefined,
    day: query.day || undefined,
  });
  if (!file) throw createError({ statusCode: 404, statusMessage: "Отчёт не найден" });

  setHeader(event, "Content-Type", "text/csv; charset=utf-8");
  setHeader(event, "Content-Disposition", `attachment; filename="${file.filename}"`);
  setHeader(event, "Cache-Control", "no-store");
  return file.text;
});
