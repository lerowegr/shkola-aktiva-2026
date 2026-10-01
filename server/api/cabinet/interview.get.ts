import { loadInterview } from "~~/lib/interviews/booking";
import { requireUser } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { interview: await loadInterview(user.id) };
});
