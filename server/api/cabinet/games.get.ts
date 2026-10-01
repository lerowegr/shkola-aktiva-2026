import { standings } from "~~/lib/games/results";
import { requireUser } from "~~/server/utils/session";

/** Свои лучшие результаты и места во всех играх. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { games: await standings(user.id), staff: user.isStaff };
});
