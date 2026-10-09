import { db } from "~~/lib/db";

import type { AdminResult } from "./roles";

/**
 * Сценарий собеседования: блоки и вопросы из таблицы.
 * Удалить вопрос с заметками мастеров нельзя — сначала пусть допройдёт
 * отбор; порядок и тексты правятся свободно.
 */
export interface GuideQuestionInput {
  id?: string;
  block: string;
  text: string;
  intro: boolean;
}

export async function loadGuideQuestions(seasonId: string) {
  return db.interviewQuestion.findMany({
    where: { seasonId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      block: true,
      text: true,
      intro: true,
      _count: { select: { notes: true } },
    },
  });
}

export async function saveGuideQuestion(seasonId: string, input: GuideQuestionInput): Promise<AdminResult> {
  const block = input.block.trim();
  const text = input.text.trim();
  if (!block) return { ok: false, message: "Назовите блок." };
  if (!text) return { ok: false, message: "Напишите сам вопрос." };

  if (input.id) {
    const existing = await db.interviewQuestion.findFirst({ where: { id: input.id, seasonId }, select: { id: true } });
    if (!existing) return { ok: false, message: "Вопрос не найден." };
    await db.interviewQuestion.update({ where: { id: input.id }, data: { block, text, intro: input.intro } });
  } else {
    const max = await db.interviewQuestion.aggregate({ where: { seasonId }, _max: { order: true } });
    await db.interviewQuestion.create({
      data: { seasonId, order: (max._max.order ?? 0) + 1, block, text, intro: input.intro },
    });
  }
  return { ok: true };
}

export async function deleteGuideQuestion(seasonId: string, id: string): Promise<AdminResult> {
  const existing = await db.interviewQuestion.findFirst({
    where: { id, seasonId },
    select: { id: true, _count: { select: { notes: true } } },
  });
  if (!existing) return { ok: false, message: "Вопрос не найден." };
  if (existing._count.notes > 0) return { ok: false, message: "По вопросу уже есть заметки — удалять нельзя." };
  await db.interviewQuestion.delete({ where: { id } });
  return { ok: true };
}

export async function moveGuideQuestion(seasonId: string, id: string, dir: "up" | "down"): Promise<AdminResult> {
  const questions = await db.interviewQuestion.findMany({
    where: { seasonId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const index = questions.findIndex((question) => question.id === id);
  const current = questions[index];
  const other = questions[index + (dir === "up" ? -1 : 1)];
  if (!current || !other) return { ok: false, message: "Двигать некуда." };
  await db.$transaction([
    db.interviewQuestion.update({ where: { id: current.id }, data: { order: other.order } }),
    db.interviewQuestion.update({ where: { id: other.id }, data: { order: current.order } }),
  ]);
  return { ok: true };
}
