import { loadTasks } from "~~/lib/assessment/notes";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Задания центра оценки — все, и выключенные. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "forms.manage");
  return { tasks: await loadTasks(await requireCurrentSeasonId(), true) };
});
