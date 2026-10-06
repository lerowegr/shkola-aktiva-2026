import { loadQuiz } from "~~/lib/admin/quiz";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  await requirePermission(event, "forms.manage");
  return { questions: await loadQuiz(await requireCurrentSeasonId()) };
});
