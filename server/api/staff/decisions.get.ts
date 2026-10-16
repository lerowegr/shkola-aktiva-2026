import { rankFinal } from "~~/lib/applications/decisions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Рейтинг итогов отбора с решениями — страница «Итоги». */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "applications.decide");
  return { rows: await rankFinal(await requireCurrentSeasonId()) };
});
