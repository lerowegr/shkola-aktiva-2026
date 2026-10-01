import { loadCandidateApplication } from "~~/lib/applications/candidate";
import { requireUser } from "~~/server/utils/session";

/** Анкета текущего сезона глазами кандидата. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { data: await loadCandidateApplication(user.id) };
});
