/**
 * Перенос «Теста про ША» из Mini App «ША бот внешка» в кабинет.
 *
 * 1. Вопросы сезона заменяются вопросами бота (app/games/sha-test-questions.ts),
 *    если на сайте тест ещё никто не прошёл. Иначе вопросы не трогаем.
 * 2. Результаты бота переносятся попытками с source=BOT и Telegram ID. Человек,
 *    который войдёт на сайт через тот же Telegram, увидит свой балл и второй раз
 *    тест не пройдёт. Повторный запуск дублей не создаёт.
 *
 * Вход — JSON, выгруженный из SQLite бота:
 *   { users: [{ telegram_user_id, telegram_username, result, completed_at, last_name, first_name,
 *               middle_name, course, faculty, student_id, phone, total_ms }],
 *     answers: [{ telegram_user_id, q_index, correct, time_ms }] }
 *
 *   npx tsx scripts/import-bot-test.ts bot-export.json
 */
import { readFileSync } from "node:fs";

import { SHA_TEST_QUESTIONS } from "../app/games/sha-test-questions";
import { db } from "../lib/db";

interface BotUser {
  telegram_user_id: number | string;
  telegram_username: string | null;
  result: string;
  completed_at: string;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  course: string | null;
  faculty: string | null;
  student_id: string | null;
  phone: string | null;
  total_ms: number | null;
}
interface BotAnswer {
  telegram_user_id: number | string;
  q_index: number;
  correct: number;
  time_ms: number;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Укажите файл выгрузки: npx tsx scripts/import-bot-test.ts bot-export.json");
  const dump = JSON.parse(readFileSync(path, "utf8")) as { users: BotUser[]; answers: BotAnswer[] };

  const season = await db.season.findFirstOrThrow({ where: { isCurrent: true }, select: { id: true } });

  // --- Вопросы ---------------------------------------------------------------
  const siteAttempts = await db.quizAttempt.count({ where: { seasonId: season.id, source: "SITE" } });
  const current = await db.quizQuestion.findMany({ where: { seasonId: season.id, isActive: true }, orderBy: { order: "asc" }, select: { text: true } });
  const same = current.map((question) => question.text).join("\n") === SHA_TEST_QUESTIONS.map((question) => question.text).join("\n");
  if (same) {
    console.log("Вопросы теста уже как в боте.");
  } else if (siteAttempts === 0) {
    await db.$transaction([
      db.quizQuestion.deleteMany({ where: { seasonId: season.id } }),
      db.quizQuestion.createMany({
        data: SHA_TEST_QUESTIONS.map((question, index) => ({
          seasonId: season.id,
          order: index + 1,
          text: question.text,
          options: question.options,
          correct: question.correct,
          isActive: true,
        })),
      }),
    ]);
    console.log(`Вопросы теста: ${SHA_TEST_QUESTIONS.length} из бота.`);
  } else {
    console.log(`Вопросы не тронуты: на сайте тест уже прошли ${siteAttempts}.`);
  }
  const questions = await db.quizQuestion.findMany({ where: { seasonId: season.id }, orderBy: { order: "asc" }, select: { id: true, text: true } });
  const byText = new Map(questions.map((question) => [question.text, question.id]));

  // --- Результаты ------------------------------------------------------------
  let created = 0;
  let skipped = 0;
  for (const user of dump.users) {
    const telegramId = String(user.telegram_user_id);
    const score = Number.parseInt(user.result.replace("score_", ""), 10);
    if (!Number.isInteger(score)) {
      skipped++;
      continue;
    }
    const answers = dump.answers
      .filter((answer) => String(answer.telegram_user_id) === telegramId)
      .sort((a, b) => a.q_index - b.q_index)
      .flatMap((answer) => {
        const question = SHA_TEST_QUESTIONS[answer.q_index];
        if (!question) return [];
        return [
          {
            questionId: byText.get(question.text) ?? null,
            question: question.text,
            // Бот хранил только «верно или нет», выбранный вариант неизвестен.
            chosen: "",
            correct: answer.correct === 1,
            ms: Math.max(0, answer.time_ms),
          },
        ];
      });

    const site = await db.user.findUnique({ where: { telegramId }, select: { id: true } });
    const exists = await db.quizAttempt.findFirst({
      where: { seasonId: season.id, OR: [{ telegramId }, ...(site ? [{ userId: site.id }] : [])] },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }

    await db.quizAttempt.create({
      data: {
        seasonId: season.id,
        userId: site?.id ?? null,
        telegramId,
        score,
        total: SHA_TEST_QUESTIONS.length,
        durationMs: user.total_ms ?? answers.reduce((sum, answer) => sum + answer.ms, 0),
        answers,
        profile: {
          lastName: user.last_name,
          firstName: user.first_name,
          middleName: user.middle_name,
          course: user.course,
          faculty: user.faculty,
          studentId: user.student_id,
          phone: user.phone,
          username: user.telegram_username,
        },
        source: "BOT",
        completedAt: new Date(user.completed_at.includes("T") || user.completed_at.endsWith("Z") ? user.completed_at : `${user.completed_at.replace(" ", "T")}Z`),
      },
    });
    created++;
  }

  console.log(`Результатов из бота: перенесено ${created}, пропущено ${skipped} (уже были или без балла).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
