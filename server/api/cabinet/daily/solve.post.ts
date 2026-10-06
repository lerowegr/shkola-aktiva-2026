import { z } from "zod";

import { solveDaily } from "~~/lib/games/daily";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({
  kind: z.enum(["MEMORY", "PIXEL", "QUIZ"]),
  score: z.number().int(),
  moves: z.number().int().nullish(),
  durationMs: z.number().int(),
});

/**
 * Решение задания дня. Попытка одна: повтор отвечает «уже решено».
 * Аудита нет — действие кандидата, на отбор не влияет.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  return solveDaily(user.id, { kind: body.kind, score: body.score, moves: body.moves, timeMs: body.durationMs });
});
