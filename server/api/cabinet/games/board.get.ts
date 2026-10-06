import { gameBoard } from "~~/lib/games/board";
import { gameBySlug } from "~~/lib/games/rules";
import { requireUser } from "~~/server/utils/session";

/** Топ игры: ?game=pixels. Staff видит и настоящие имена. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const game = gameBySlug(String(getQuery(event).game ?? ""));
  if (!game) throw createError({ statusCode: 404, statusMessage: "Такой игры нет." });
  return gameBoard(game, user.id, { staff: user.isStaff });
});
