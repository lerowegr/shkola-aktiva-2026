import { db } from "~~/lib/db";

import type { AdminResult } from "./roles";

/**
 * Вопросы викторины текущего сезона. Удаление мягкое по смыслу жёсткое:
 * сыгранные партии хранят только очки, поэтому вопрос можно удалять —
 * история игр не ломается.
 */
export interface QuizQuestionInput {
  id?: string;
  text: string;
  options: string[];
  correct: number;
  isActive: boolean;
}

export async function loadQuiz(seasonId: string) {
  return db.quizQuestion.findMany({
    where: { seasonId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, text: true, options: true, correct: true, isActive: true },
  });
}

export async function saveQuizQuestion(seasonId: string, input: QuizQuestionInput): Promise<AdminResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, message: "Напишите сам вопрос." };
  const options = [...new Set(input.options.map((option) => option.trim()).filter(Boolean))];
  if (options.length < 2) return { ok: false, message: "Нужно хотя бы два варианта ответа." };
  if (options.length > 6) return { ok: false, message: "Не больше шести вариантов." };
  if (input.correct < 0 || input.correct >= options.length) {
    return { ok: false, message: `Верный вариант — номер от 1 до ${options.length}.` };
  }
  const correct = input.correct;

  if (input.id) {
    const existing = await db.quizQuestion.findFirst({ where: { id: input.id, seasonId }, select: { id: true } });
    if (!existing) return { ok: false, message: "Вопрос не найден." };
    await db.quizQuestion.update({ where: { id: input.id }, data: { text, options, correct, isActive: input.isActive } });
  } else {
    const max = await db.quizQuestion.aggregate({ where: { seasonId }, _max: { order: true } });
    await db.quizQuestion.create({
      data: { seasonId, order: (max._max.order ?? 0) + 1, text, options, correct, isActive: input.isActive },
    });
  }
  return { ok: true };
}

export async function deleteQuizQuestion(seasonId: string, id: string): Promise<AdminResult> {
  const existing = await db.quizQuestion.findFirst({ where: { id, seasonId }, select: { id: true } });
  if (!existing) return { ok: false, message: "Вопрос не найден." };
  await db.quizQuestion.delete({ where: { id } });
  return { ok: true };
}

export async function moveQuizQuestion(seasonId: string, id: string, dir: "up" | "down"): Promise<AdminResult> {
  const questions = await db.quizQuestion.findMany({ where: { seasonId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  const index = questions.findIndex((question) => question.id === id);
  const other = questions[index + (dir === "up" ? -1 : 1)];
  const current = questions[index];
  if (!current || !other) return { ok: false, message: "Двигать некуда." };
  await db.$transaction([
    db.quizQuestion.update({ where: { id: current.id }, data: { order: other.order } }),
    db.quizQuestion.update({ where: { id: other.id }, data: { order: current.order } }),
  ]);
  return { ok: true };
}
