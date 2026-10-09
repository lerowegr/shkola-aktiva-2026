import { writeAudit } from "~~/lib/audit";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";

import type { AuditContext } from "../applications/review-store";

/**
 * Сценарий собеседования: блоки вопросов из таблицы, под каждым вопросом —
 * ячейки комментариев мастеров (своя редактируется, чужие читаются).
 * Кандидат этого не видит: гайд живёт только в кабинете организатора.
 */
export interface GuideNote {
  authorId: string;
  authorName: string;
  note: string;
  isMine: boolean;
}

export interface GuideItem {
  id: string;
  text: string;
  intro: boolean;
  notes: GuideNote[];
}

export interface GuideBlock {
  block: string;
  items: GuideItem[];
}

export async function loadGuide(seasonId: string, applicationId: string, viewerId: string): Promise<GuideBlock[]> {
  const questions = await db.interviewQuestion.findMany({
    where: { seasonId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      block: true,
      text: true,
      intro: true,
      notes: {
        where: { applicationId },
        select: {
          note: true,
          authorId: true,
          author: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } },
        },
      },
    },
  });

  const blocks: GuideBlock[] = [];
  const byName = new Map<string, GuideBlock>();
  for (const question of questions) {
    const notes = question.notes
      .map((item) => ({
        authorId: item.authorId,
        authorName: displayName(item.author),
        note: item.note,
        isMine: item.authorId === viewerId,
      }))
      .sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.authorName.localeCompare(b.authorName, "ru"));
    const item: GuideItem = { id: question.id, text: question.text, intro: question.intro, notes };
    const existing = byName.get(question.block);
    if (existing) existing.items.push(item);
    else {
      const block: GuideBlock = { block: question.block, items: [item] };
      byName.set(question.block, block);
      blocks.push(block);
    }
  }
  return blocks;
}

export const NOTE_MAX = 2000;
const NOTE_AUDIT_EVERY_MS = 5 * 60 * 1000;

export type NoteResult = { ok: true } | { ok: false; message: string };

/** Сохранить свою ячейку. Пустая стирает заметку. */
export async function saveNote(
  params: { applicationId: string; questionId: string; authorId: string; note: string },
  context: AuditContext = {},
): Promise<NoteResult> {
  const text = params.note.slice(0, NOTE_MAX);
  const owned = await db.interviewQuestion.findFirst({
    where: { id: params.questionId },
    select: { id: true, block: true, seasonId: true },
  });
  if (!owned) return { ok: false, message: "Вопрос не найден — обновите страницу." };

  const application = await db.application.findUnique({
    where: { id: params.applicationId },
    select: { id: true, seasonId: true },
  });
  if (!application || application.seasonId !== owned.seasonId) {
    return { ok: false, message: "Анкета не найдена — обновите страницу." };
  }

  if (params.note.trim() === "") {
    await db.interviewNote.deleteMany({
      where: { applicationId: params.applicationId, questionId: params.questionId, authorId: params.authorId },
    });
  } else {
    await db.interviewNote.upsert({
      where: {
        applicationId_questionId_authorId: {
          applicationId: params.applicationId,
          questionId: params.questionId,
          authorId: params.authorId,
        },
      },
      create: { applicationId: params.applicationId, questionId: params.questionId, authorId: params.authorId, note: text },
      update: { note: text },
    });
  }

  const recent = await db.auditLog.findFirst({
    where: {
      actorId: params.authorId,
      action: "interview.note",
      entityId: params.questionId,
      createdAt: { gt: new Date(Date.now() - NOTE_AUDIT_EVERY_MS) },
    },
    select: { id: true },
  });
  if (!recent) {
    await writeAudit({
      actorId: params.authorId,
      action: "interview.note",
      entityType: "interview_question",
      entityId: params.questionId,
      meta: { block: owned.block, applicationId: params.applicationId },
      ...context,
    });
  }
  return { ok: true };
}
