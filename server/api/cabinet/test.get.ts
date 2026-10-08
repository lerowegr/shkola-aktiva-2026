import { loadCandidateTest } from "~~/lib/games/sha-test-store";
import { requireUser } from "~~/server/utils/session";

/** «Тест про ША»: свой результат или вопросы — без верных ответов. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return loadCandidateTest(user.id);
});
