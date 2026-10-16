import { writeAudit } from "~~/lib/audit";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";

import type { AuditContext } from "../applications/review-store";

/**
 * Сценарий собеседования: блоки вопросов из таблицы, под каждым вопросом —
 * колонки мастеров собеседования, слева направо в одном порядке у всех.
 * Свою колонку мастер пишет, чужие видит и сразу замечает, что там
 * появляется текст: страница опрашивает `loadGuideNotes` каждые пару секунд.
 * Кандидат этого не видит: гайд живёт только в кабинете организатора.
 */
export interface GuideColumn {
  id: string;
  name: string;
  isMine: boolean;
  /** Назначен на собеседование — колонка видна, даже пока пустая. */
  assigned: boolean;
}

export interface GuideNoteRow {
  questionId: string;
  authorId: string;
  note: string;
  updatedAt: Date;
}

export interface GuideNotes {
  columns: GuideColumn[];
  notes: GuideNoteRow[];
}

export interface GuideItem {
  id: string;
  text: string;
  intro: boolean;
}

export interface GuideBlock {
  block: string;
  items: GuideItem[];
}

export interface GuideView extends GuideNotes {
  blocks: GuideBlock[];
}

const PERSON = { id: true, firstName: true, lastName: true, telegramUsername: true, email: true } as const;

/** Колонки и заметки — то, что страница опрашивает, пока открыт сценарий. */
export async function loadGuideNotes(applicationId: string, viewerId: string): Promise<GuideNotes> {
  const [reviews, rows] = await Promise.all([
    db.review.findMany({
      where: { applicationId, stageKind: "INTERVIEW", releasedAt: null },
      select: { reviewer: { select: PERSON } },
    }),
    db.interviewNote.findMany({
      where: { applicationId },
      select: { questionId: true, authorId: true, note: true, updatedAt: true, author: { select: PERSON } },
    }),
  ]);

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ru");
  const assigned = reviews
    .map(({ reviewer }) => ({ id: reviewer.id, name: displayName(reviewer), isMine: reviewer.id === viewerId, assigned: true }))
    .sort(byName);
  const known = new Set(assigned.map((column) => column.id));
  const others = new Map<string, GuideColumn>();
  for (const row of rows) {
    if (known.has(row.authorId) || others.has(row.authorId)) continue;
    others.set(row.authorId, { id: row.authorId, name: displayName(row.author), isMine: row.authorId === viewerId, assigned: false });
  }
  return {
    columns: [...assigned, ...[...others.values()].sort(byName)],
    notes: rows.map(({ questionId, authorId, note, updatedAt }) => ({ questionId, authorId, note, updatedAt })),
  };
}

export async function loadGuide(seasonId: string, applicationId: string, viewerId: string): Promise<GuideView> {
  const [questions, notes] = await Promise.all([
    db.interviewQuestion.findMany({
      where: { seasonId },
      orderBy: { order: "asc" },
      select: { id: true, block: true, text: true, intro: true },
    }),
    loadGuideNotes(applicationId, viewerId),
  ]);

  // Блоки — подряд идущими вопросами, как в таблице: один блок может
  // встретиться дважды («Ответственность» до и после смешанного блока).
  const blocks: GuideBlock[] = [];
  for (const question of questions) {
    const item: GuideItem = { id: question.id, text: question.text, intro: question.intro };
    const last = blocks.at(-1);
    if (last?.block === question.block) last.items.push(item);
    else blocks.push({ block: question.block, items: [item] });
  }
  return { blocks, ...notes };
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
