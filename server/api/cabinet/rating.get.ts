import { overallBoard } from "~~/lib/games/board";
import { requireUser } from "~~/server/utils/session";

/** Общий зачёт по всем играм. Staff видит и настоящие имена. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return overallBoard(user.id, { staff: user.isStaff });
});
