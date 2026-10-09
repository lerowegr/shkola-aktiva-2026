import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";

import { grade, readAnswers, testStats, type Submission, type TestStats } from "./sha-test";

/**
 * «Тест про ША» на базе: вопросы, одна попытка, итоги для организаторов.
 *
 * Попытка ищется по человеку, а если её нет — по его Telegram: так человек,
 * прошедший тест в боте до переезда на сайт, видит свой результат и второй
 * раз не проходит. Найденная по Telegram попытка тут же привязывается к нему.
 */

async function currentSeasonId(): Promise<string | null> {
  const season = await db.season.findFirst({ where: { isCurrent: true }, select: { id: true } });
  return season?.id ?? null;
}

function activeQuestions(seasonId: string) {
  return db.quizQuestion.findMany({
    where: { seasonId, isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, text: true, options: true, correct: true },
  });
}

const attemptSelect = { id: true, userId: true, score: true, total: true, source: true, completedAt: true } as const;

async function findAttempt(seasonId: string, userId: string) {
  const own = await db.quizAttempt.findUnique({ where: { seasonId_userId: { seasonId, userId } }, select: attemptSelect });
  if (own) return own;

  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  if (!user?.telegramId) return null;
  const fromBot = await db.quizAttempt.findUnique({
    where: { seasonId_telegramId: { seasonId, telegramId: user.telegramId } },
    select: attemptSelect,
  });
  if (!fromBot) return null;
  if (fromBot.userId === null) {
    await db.quizAttempt.update({ where: { id: fromBot.id }, data: { userId } }).catch(() => undefined);
  }
  return fromBot;
}

export interface CandidateTest {
  /** Пройден — только счёт, без разбора: правильные ответы не показываем. */
  done: { score: number; total: number; completedAt: Date; fromBot: boolean } | null;
  /** Не пройден — вопросы без верных ответов. */
  questions: { id: string; text: string; options: string[] }[];
}

export async function loadCandidateTest(userId: string): Promise<CandidateTest> {
  const seasonId = await currentSeasonId();
  if (!seasonId) return { done: null, questions: [] };

  const attempt = await findAttempt(seasonId, userId);
  if (attempt) {
    return {
      done: { score: attempt.score, total: attempt.total, completedAt: attempt.completedAt, fromBot: attempt.source === "BOT" },
      questions: [],
    };
  }
  const questions = await activeQuestions(seasonId);
  return { done: null, questions: questions.map(({ id, text, options }) => ({ id, text, options })) };
}

export type SubmitResult = { ok: true; score: number; total: number } | { ok: false; message: string };

export async function submitTest(userId: string, submission: Submission[]): Promise<SubmitResult> {
  const seasonId = await currentSeasonId();
  if (!seasonId) return { ok: false, message: "Сезон ещё не начался — тест появится позже." };

  if (await findAttempt(seasonId, userId)) return { ok: false, message: "Вы уже прошли тест — засчитывается первая попытка." };

  const graded = grade(await activeQuestions(seasonId), submission);
  if (!graded.ok) return graded;

  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  try {
    await db.quizAttempt.create({
      data: {
        seasonId,
        userId,
        telegramId: user?.telegramId ?? null,
        score: graded.score,
        total: graded.total,
        durationMs: graded.durationMs,
        answers: JSON.parse(JSON.stringify(graded.answers)),
      },
    });
  } catch (error) {
    // Двойное нажатие или вторая вкладка: засчитана первая.
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, message: "Вы уже прошли тест — засчитывается первая попытка." };
    }
    throw error;
  }
  return { ok: true, score: graded.score, total: graded.total };
}

// ---------------------------------------------------------------------------
// Организаторам
// ---------------------------------------------------------------------------

export interface TestRow {
  name: string;
  telegram: string | null;
  course: string | null;
  faculty: string | null;
  studentId: string | null;
  phone: string | null;
  score: number;
  total: number;
  durationMs: number;
  source: string;
  completedAt: Date;
  answers: ReturnType<typeof readAnswers>;
}

function text(profile: Record<string, unknown> | null, key: string): string | null {
  const value = profile?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function testRows(seasonId: string): Promise<TestRow[]> {
  const attempts = await db.quizAttempt.findMany({
    where: { seasonId },
    orderBy: { completedAt: "asc" },
    select: {
      score: true,
      total: true,
      durationMs: true,
      source: true,
      completedAt: true,
      answers: true,
      profile: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          telegramUsername: true,
          middleName: true,
          course: true,
          faculty: true,
          studentId: true,
          phone: true,
          applications: {
            where: { seasonId },
            select: { lastName: true, firstName: true, middleName: true, studentId: true },
          },
        },
      },
    },
  });

  return attempts.map((attempt) => {
    const profile = attempt.profile && typeof attempt.profile === "object" ? (attempt.profile as Record<string, unknown>) : null;
    const application = attempt.user?.applications[0];
    const fromApplication = application
      ? [application.lastName, application.firstName, application.middleName].filter(Boolean).join(" ")
      : "";
    const fromBot = [text(profile, "lastName"), text(profile, "firstName"), text(profile, "middleName")].filter(Boolean).join(" ");
    const username = attempt.user?.telegramUsername ?? text(profile, "username");
    // Знакомство на сайте — свежее анкеты и бота; дальше анкета, потом бот.
    const person = attempt.user;
    const fromOnboarding = person?.lastName && person.firstName ? [person.lastName, person.firstName, person.middleName].filter(Boolean).join(" ") : "";
    return {
      name: fromOnboarding || fromApplication || (person ? displayName(person) : "") || fromBot || "Без имени",
      telegram: username ? `@${username}` : null,
      course: person?.course ?? text(profile, "course"),
      faculty: person?.faculty ?? text(profile, "faculty"),
      studentId: person?.studentId ?? application?.studentId ?? text(profile, "studentId"),
      phone: person?.phone ?? text(profile, "phone"),
      score: attempt.score,
      total: attempt.total,
      durationMs: attempt.durationMs,
      source: attempt.source,
      completedAt: attempt.completedAt,
      answers: readAnswers(attempt.answers),
    };
  });
}

export async function testOverview(seasonId: string): Promise<TestStats> {
  const [rows, questions] = await Promise.all([testRows(seasonId), activeQuestions(seasonId)]);
  return testStats(rows, questions);
}
