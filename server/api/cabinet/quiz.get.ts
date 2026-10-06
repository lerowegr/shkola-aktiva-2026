import { db } from "~~/lib/db";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

/**
 * Вопросы викторины текущего сезона. Верный ответ едет на клиент вместе
 * с вопросом: игра шуточная, защита — диапазонами правдоподобия.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event);
  const questions = await db.quizQuestion.findMany({
    where: { seasonId: await requireCurrentSeasonId(), isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, text: true, options: true, correct: true },
  });
  return { questions };
});
