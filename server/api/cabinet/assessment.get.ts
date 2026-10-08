import { loadCandidateAssessment } from "~~/lib/assessment/candidate";
import { requireUser } from "~~/server/utils/session";

/** Центр оценки глазами кандидата: этап и место, без оценок. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { assessment: await loadCandidateAssessment(user.id) };
});
