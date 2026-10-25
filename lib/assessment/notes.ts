import { writeAudit } from "~~/lib/audit";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { can, type Actor } from "~~/lib/permissions";

import type { AuditContext } from "../applications/review-store";

/**
 * Живые комментарии центра оценки: по каждому заданию ЦО — от каждого эксперта
 * подгруппы о каждом кандидате, и фон подгруппы — общий текст эксперта о том,
 * как идёт ЦО. Устроено как сценарий собеса: колонка на эксперта, свою пишет,
 * чужие видит, страница опрашивает `loadNotes` каждые пару секунд.
 *
 * Пишет только эксперт подгруппы. Читают эксперты подгруппы и те, кому можно
 * видеть все анкеты или распределять. Кандидат этого не видит никогда.
 */
export const TASK_NOTE_MAX = 2000;
export const GROUP_NOTE_MAX = 4000;
const AUDIT_EVERY_MS = 5 * 60 * 1000;

export interface NoteColumn {
  id: string;
  name: string;
  isMine: boolean;
  /** Эксперт подгруппы — колонка видна, даже пока пустая. */
  expert: boolean;
}

export interface GroupNotes {
  columns: NoteColumn[];
  tasks: { id: string; title: string }[];
  taskNotes: { taskId: string; applicationId: string; authorId: string; text: string }[];
  groupNotes: { authorId: string; text: string }[];
}

type Result = { ok: true } | { ok: false; message: string };

const PERSON = { id: true, firstName: true, lastName: true, telegramUsername: true, email: true } as const;

/** Задания ЦО сезона по порядку; без `all` — только действующие. */
export async function loadTasks(seasonId: string, all = false) {
  return db.assessmentTask.findMany({
    where: { seasonId, ...(all ? {} : { active: true }) },
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: { id: true, title: true, order: true, active: true },
  });
}

/** Кто может читать заметки подгруппы и может ли писать. */
export async function noteAccess(user: Actor & { id: string }, groupId: string) {
  const expert = await db.assessmentExpert.findFirst({ where: { groupId, userId: user.id }, select: { userId: true } });
  const write = Boolean(expert) && can(user, "applications.review");
  const read = write || can(user, "applications.view_all") || can(user, "applications.assign");
  return { read, write };
}

export async function loadNotes(seasonId: string, groupId: string, viewerId: string): Promise<GroupNotes | null> {
  const group = await db.assessmentGroup.findFirst({
    where: { id: groupId, seasonId },
    select: { experts: { select: { user: { select: PERSON } } }, members: { select: { applicationId: true } } },
  });
  if (!group) return null;
  const members = group.members.map((member) => member.applicationId);

  const [tasks, taskRows, groupRows] = await Promise.all([
    loadTasks(seasonId),
    db.assessmentTaskNote.findMany({
      where: { applicationId: { in: members }, task: { seasonId } },
      select: { taskId: true, applicationId: true, authorId: true, text: true, author: { select: PERSON } },
    }),
    db.assessmentGroupNote.findMany({
      where: { groupId },
      select: { authorId: true, text: true, author: { select: PERSON } },
    }),
  ]);

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ru");
  const experts = group.experts
    .map(({ user }) => ({ id: user.id, name: displayName(user), isMine: user.id === viewerId, expert: true }))
    .sort(byName);
  // Бывший эксперт подгруппы: его написанное остаётся видно.
  const known = new Set(experts.map((column) => column.id));
  const others = new Map<string, NoteColumn>();
  for (const row of [...taskRows, ...groupRows]) {
    if (known.has(row.authorId) || others.has(row.authorId)) continue;
    others.set(row.authorId, { id: row.authorId, name: displayName(row.author), isMine: row.authorId === viewerId, expert: false });
  }

  return {
    columns: [...experts, ...[...others.values()].sort(byName)],
    tasks: tasks.map((task) => ({ id: task.id, title: task.title })),
    taskNotes: taskRows.map(({ taskId, applicationId, authorId, text }) => ({ taskId, applicationId, authorId, text })),
    groupNotes: groupRows.map(({ authorId, text }) => ({ authorId, text })),
  };
}

async function auditThrottled(
  params: { actorId: string; action: string; entityType: string; entityId: string; meta: Record<string, unknown> },
  context: AuditContext,
) {
  const recent = await db.auditLog.findFirst({
    where: { actorId: params.actorId, action: params.action, entityId: params.entityId, createdAt: { gt: new Date(Date.now() - AUDIT_EVERY_MS) } },
    select: { id: true },
  });
  if (!recent) await writeAudit({ ...params, ...context });
}

/** Своя ячейка «задание × кандидат». Пустая стирает. */
export async function saveTaskNote(
  seasonId: string,
  params: { applicationId: string; taskId: string; authorId: string; text: string },
  context: AuditContext = {},
): Promise<Result> {
  if (params.text.length > TASK_NOTE_MAX) return { ok: false, message: `Не длиннее ${TASK_NOTE_MAX} знаков — сократите текст.` };
  const task = await db.assessmentTask.findFirst({ where: { id: params.taskId, seasonId }, select: { id: true, title: true } });
  if (!task) return { ok: false, message: "Задание не найдено — обновите страницу." };
  const member = await db.assessmentMember.findFirst({
    where: { applicationId: params.applicationId, group: { seasonId, experts: { some: { userId: params.authorId } } } },
    select: { groupId: true },
  });
  if (!member) return { ok: false, message: "Кандидат не в вашей подгруппе — комментировать его могут её эксперты." };

  const key = { taskId_applicationId_authorId: { taskId: task.id, applicationId: params.applicationId, authorId: params.authorId } };
  if (params.text.trim() === "") {
    await db.assessmentTaskNote.deleteMany({ where: key.taskId_applicationId_authorId });
  } else {
    await db.assessmentTaskNote.upsert({
      where: key,
      create: { taskId: task.id, applicationId: params.applicationId, authorId: params.authorId, text: params.text },
      update: { text: params.text },
    });
  }
  await auditThrottled(
    {
      actorId: params.authorId,
      action: "assessment.task_note",
      entityType: "application",
      entityId: params.applicationId,
      meta: { task: task.title, groupId: member.groupId },
    },
    context,
  );
  return { ok: true };
}

/** Свой фоновый комментарий подгруппы. Пустой стирает. */
export async function saveGroupNote(
  seasonId: string,
  params: { groupId: string; authorId: string; text: string },
  context: AuditContext = {},
): Promise<Result> {
  if (params.text.length > GROUP_NOTE_MAX) return { ok: false, message: `Не длиннее ${GROUP_NOTE_MAX} знаков — сократите текст.` };
  const group = await db.assessmentGroup.findFirst({
    where: { id: params.groupId, seasonId, experts: { some: { userId: params.authorId } } },
    select: { id: true, title: true },
  });
  if (!group) return { ok: false, message: "Это не ваша подгруппа — фон пишут её эксперты." };

  const key = { groupId_authorId: { groupId: group.id, authorId: params.authorId } };
  if (params.text.trim() === "") {
    await db.assessmentGroupNote.deleteMany({ where: key.groupId_authorId });
  } else {
    await db.assessmentGroupNote.upsert({
      where: key,
      create: { groupId: group.id, authorId: params.authorId, text: params.text },
      update: { text: params.text },
    });
  }
  await auditThrottled(
    { actorId: params.authorId, action: "assessment.group_note", entityType: "assessment_group", entityId: group.id, meta: { title: group.title } },
    context,
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Админка: список заданий
// ---------------------------------------------------------------------------

const TASK_TITLE_MAX = 80;

export async function saveTask(
  seasonId: string,
  input: { id?: string; title: string; order?: number; active?: boolean },
): Promise<({ ok: true; id: string; created: boolean }) | { ok: false; message: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Назовите задание — например, «Рефлексия»." };
  if (title.length > TASK_TITLE_MAX) return { ok: false, message: `Название — до ${TASK_TITLE_MAX} знаков.` };

  if (input.id) {
    const found = await db.assessmentTask.findFirst({ where: { id: input.id, seasonId }, select: { id: true } });
    if (!found) return { ok: false, message: "Задание не найдено — обновите страницу." };
    await db.assessmentTask.update({
      where: { id: found.id },
      data: { title, ...(input.order !== undefined ? { order: input.order } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
    });
    return { ok: true, id: found.id, created: false };
  }
  const last = await db.assessmentTask.findFirst({ where: { seasonId }, orderBy: { order: "desc" }, select: { order: true } });
  const created = await db.assessmentTask.create({
    data: { seasonId, title, order: input.order ?? (last?.order ?? 0) + 1, active: input.active ?? true },
    select: { id: true },
  });
  return { ok: true, id: created.id, created: true };
}

/** Удалить можно только задание без комментариев — иначе только выключить. */
export async function deleteTask(seasonId: string, id: string): Promise<({ ok: true; title: string }) | { ok: false; message: string }> {
  const task = await db.assessmentTask.findFirst({ where: { id, seasonId }, select: { id: true, title: true, _count: { select: { notes: true } } } });
  if (!task) return { ok: false, message: "Задание не найдено — обновите страницу." };
  if (task._count.notes > 0) {
    return { ok: false, message: `К заданию уже есть комментарии экспертов (${task._count.notes}) — его можно только выключить.` };
  }
  await db.assessmentTask.delete({ where: { id: task.id } });
  return { ok: true, title: task.title };
}
