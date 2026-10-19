import { z } from "zod";

import { submitTest } from "~~/lib/games/sha-test-store";
import { ForbiddenError } from "~~/lib/auth/actor";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(40),
        chosen: z.number().int(),
        ms: z.number().int(),
      }),
    )
    .min(1, "Ответьте на все вопросы — тогда тест засчитается.")
    .max(50),
});

/**
 * Ответы теста. Счёт считает сервер по своим верным ответам. Аудита нет:
 * это действие кандидата, и на отбор тест не влияет.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  if (user.mustChangePassword)
    throw new ForbiddenError("Сначала задайте свой пароль вместо временного.");
  return submitTest(user.id, body.answers);
});
