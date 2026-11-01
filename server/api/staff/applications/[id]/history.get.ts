import { loadReviewHistory } from "~~/lib/applications/history";
import { requireUser } from "~~/server/utils/session";
import { requireCurrentSeasonId } from "~~/server/utils/season";
export default defineEventHandler(async event => {
  const actor = await requireUser(event);
  const result = await loadReviewHistory(getRouterParam(event, "id") ?? "", await requireCurrentSeasonId(), actor);
  if (result === false) throw createError({ statusCode: 403, statusMessage: "Предыдущие оценки этой анкеты вам недоступны." });
  if (!result) throw createError({ statusCode: 404, statusMessage: "Анкета не найдена." });
  return result;
});
