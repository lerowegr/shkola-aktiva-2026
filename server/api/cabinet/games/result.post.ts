import { z } from "zod";

import { saveResult, standing } from "~~/lib/games/results";
import { GAME_KINDS } from "~~/lib/games/rules";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({
  game: z.enum(GAME_KINDS),
  score: z.number().int(),
  moves: z.number().int().nullish(),
  durationMs: z.number().int(),
});

/**
 * Сыгранная партия. Аудита нет: это не действие организатора и на отбор
 * не влияет. Отвечаем сразу итогом — рекорд ли и какое место.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  const saved = await saveResult(user.id, body);
  if (!saved.ok) return saved;
  return { ok: true, record: saved.record, standing: await standing(user.id, body.game) };
});
