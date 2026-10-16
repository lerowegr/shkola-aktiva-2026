import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { canGrantRole, type Actor } from "~~/lib/permissions";

import type { AdminResult } from "./roles";

/**
 * Люди в админке: поиск, роли, блокировка.
 *
 * Выдать или снять роль можно, только если все её права есть у самого
 * действующего. Владельца не заблокировать никому: это страховка от
 * ситуации, когда в системе не осталось ни одного, кто может всё.
 * Себя тоже не заблокировать — случайно запереться снаружи слишком легко.
 */
export interface PersonRow {
  id: string;
  name: string;
  nickname: string | null;
  email: string | null;
  telegramUsername: string | null;
  avatar: string | null;
  blocked: boolean;
  isOwner: boolean;
  hasPassword: boolean;
  hasTelegram: boolean;
  roles: { id: string; name: string }[];
  application: "none" | "draft" | "submitted";
}

export async function searchPeople(params: {
  query: string;
  scope: "staff" | "all";
  limit?: number;
}): Promise<PersonRow[]> {
  const q = params.query.trim().replace(/^@/, "");
  const people = await db.user.findMany({
    where: {
      ...(params.scope === "staff" ? { OR: [{ isOwner: true }, { roles: { some: {} } }] } : {}),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                  { email: { contains: q, mode: "insensitive" as const } },
                  { telegramUsername: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: params.limit ?? 100,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      telegramUsername: true,
      telegramId: true,
      avatarKey: true,
      status: true,
      isOwner: true,
      passwordHash: true,
      roles: { select: { role: { select: { id: true, name: true, priority: true } } } },
      applications: { where: { season: { isCurrent: true } }, select: { status: true } },
    },
  });

  return people.map((person) => ({
    id: person.id,
    name: displayName(person),
    nickname: person.nickname,
    email: person.email,
    telegramUsername: person.telegramUsername,
    avatar: person.avatarKey ? `/api/avatars/${person.avatarKey}` : null,
    blocked: person.status === "BLOCKED",
    isOwner: person.isOwner,
    hasPassword: person.passwordHash !== null,
    hasTelegram: person.telegramId !== null,
    roles: person.roles
      .sort((a, b) => b.role.priority - a.role.priority)
      .map((item) => ({ id: item.role.id, name: item.role.name })),
    application: !person.applications[0]
      ? "none"
      : person.applications[0].status === "SUBMITTED"
        ? "submitted"
        : "draft",
  }));
}

export async function grantRole(actor: Actor & { id: string }, userId: string, roleId: string): Promise<AdminResult> {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true, permissions: true } });
  if (!role) return { ok: false, message: "Роль не найдена — обновите страницу." };
  if (!canGrantRole(actor, role.permissions)) {
    return { ok: false, message: `Роль «${role.name}» сильнее ваших прав — её выдаёт тех.админ.` };
  }
  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId, assignedById: actor.id },
    update: {},
  });
  return { ok: true };
}

export async function revokeRole(actor: Actor, userId: string, roleId: string): Promise<AdminResult> {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true, permissions: true } });
  if (!role) return { ok: false, message: "Роль не найдена — обновите страницу." };
  if (!canGrantRole(actor, role.permissions)) {
    return { ok: false, message: `Роль «${role.name}» сильнее ваших прав — снять её может тех.админ.` };
  }
  await db.userRole.deleteMany({ where: { userId, roleId } });
  return { ok: true };
}

export async function setBlocked(actor: { id: string }, userId: string, blocked: boolean): Promise<AdminResult> {
  if (userId === actor.id) return { ok: false, message: "Себя заблокировать нельзя." };
  const target = await db.user.findUnique({ where: { id: userId }, select: { isOwner: true } });
  if (!target) return { ok: false, message: "Человек не найден." };
  if (target.isOwner) return { ok: false, message: "Владельца системы заблокировать нельзя." };

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { status: blocked ? "BLOCKED" : "ACTIVE" } }),
    // Открытые вкладки заблокированного перестают работать сразу.
    ...(blocked ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Удаление организатора
// ---------------------------------------------------------------------------

/**
 * Удалить организатора совсем — не блокировка, а аккаунт целиком.
 *
 * Оценки решают судьбу кандидатов, а в базе они висят на мастере каскадом:
 * удали человека — пропадут и баллы. Поэтому работу (оценки с баллами или
 * словами, заметки собеседований, собеседования впереди, группы ЦО)
 * сначала передаём другому организатору целиком, вместе с баллами. Пустые
 * назначения передаются тоже — анкеты не остаются без мастера.
 * Нет работы и преемника не выбрали — пустые назначения просто снимаются.
 */
export interface DeleteCheck {
  name: string;
  /** Оценки, где уже что-то поставлено. */
  scored: number;
  /** Назначено, но не начато. */
  assigned: number;
  notes: number;
  /** Собеседования впереди, где он ведущий. */
  interviews: number;
  /** Группы ЦО, где он эксперт. */
  groups: number;
}

// Начатая оценка: есть балл, маркер или непустой комментарий.
const touched = { OR: [{ scores: { some: {} } }, { markers: { some: {} } }, { AND: [{ comment: { not: null } }, { NOT: { comment: "" } }] }] };

export async function deleteCheck(userId: string, now = new Date()): Promise<DeleteCheck | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true, telegramUsername: true },
  });
  if (!user) return null;
  const [scored, all, notes, interviews, groups] = await Promise.all([
    db.review.count({ where: { reviewerId: userId, ...touched } }),
    db.review.count({ where: { reviewerId: userId } }),
    db.interviewNote.count({ where: { authorId: userId } }),
    db.slotInterviewer.count({ where: { userId, slot: { startsAt: { gt: now } } } }),
    db.assessmentExpert.count({ where: { userId } }),
  ]);
  return { name: displayName(user), scored, assigned: all - scored, notes, interviews, groups };
}

export type DeleteResult = { ok: true; name: string; moved: number } | { ok: false; message: string };

export async function deleteOrganizer(
  actor: Actor & { id: string },
  userId: string,
  successorId: string | null,
): Promise<DeleteResult> {
  if (userId === actor.id) return { ok: false, message: "Себя удалить нельзя." };
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { isOwner: true, email: true, roles: { select: { role: { select: { name: true, permissions: true } } } } },
  });
  if (!target) return { ok: false, message: "Человек не найден — обновите страницу." };
  if (target.isOwner) return { ok: false, message: "Владельца системы удалить нельзя." };
  const permissions = target.roles.flatMap((item) => item.role.permissions);
  if (permissions.length === 0) return { ok: false, message: "Удалять можно только организаторов. Кандидата можно заблокировать." };
  // Как с ролями: удалить можно того, чьи права у тебя все есть.
  if (!canGrantRole(actor, permissions)) return { ok: false, message: "У этого организатора права сильнее ваших — удалить его может тех.админ." };

  const check = (await deleteCheck(userId))!;
  const hasWork = check.scored + check.notes + check.interviews + check.groups > 0;

  if (!successorId) {
    if (hasWork) {
      const parts = [
        check.scored && `оценок с баллами: ${check.scored}`,
        check.notes && `заметок собеседований: ${check.notes}`,
        check.interviews && `собеседований впереди: ${check.interviews}`,
        check.groups && `групп ЦО: ${check.groups}`,
      ].filter(Boolean);
      return { ok: false, message: `У ${check.name} есть работа (${parts.join(", ")}). Выберите, кому её передать, — баллы сохранятся.` };
    }
    await db.user.delete({ where: { id: userId } });
    return { ok: true, name: check.name, moved: 0 };
  }

  if (successorId === userId) return { ok: false, message: "Передать работу самому себе нельзя — выберите другого организатора." };
  const successor = await db.user.findFirst({
    where: { id: successorId, status: "ACTIVE", roles: { some: { role: { permissions: { has: "applications.review" } } } } },
    select: { id: true },
  });
  if (!successor) return { ok: false, message: "Принять работу может только активный мастер отбора — выберите другого." };

  // У преемника уже есть своя оценка того же кандидата на том же этапе —
  // две не слить: пусть разберутся руками, иначе баллы одного пропадут.
  const [mine, theirs] = await Promise.all([
    db.review.findMany({ where: { reviewerId: userId }, select: { id: true, applicationId: true, stageKind: true } }),
    db.review.findMany({ where: { reviewerId: successor.id }, select: { applicationId: true, stageKind: true } }),
  ]);
  const taken = new Set(theirs.map((review) => `${review.applicationId}:${review.stageKind}`));
  const clashes = mine.filter((review) => taken.has(`${review.applicationId}:${review.stageKind}`));
  if (clashes.length) {
    return {
      ok: false,
      message: `У выбранного мастера уже есть свои оценки тех же кандидатов (${clashes.length}). Выберите другого или сначала передайте эти анкеты вручную.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.review.updateMany({ where: { reviewerId: userId }, data: { reviewerId: successor.id } });

    // Заметки, ведущие и эксперты — переносим, где у преемника ещё нет своих.
    const notes = await tx.interviewNote.findMany({ where: { authorId: userId }, select: { id: true, applicationId: true, questionId: true } });
    for (const note of notes) {
      const exists = await tx.interviewNote.findUnique({
        where: { applicationId_questionId_authorId: { applicationId: note.applicationId, questionId: note.questionId, authorId: successor.id } },
        select: { id: true },
      });
      if (!exists) await tx.interviewNote.update({ where: { id: note.id }, data: { authorId: successor.id } });
    }
    const slots = await tx.slotInterviewer.findMany({ where: { userId }, select: { id: true, slotId: true } });
    for (const slot of slots) {
      const exists = await tx.slotInterviewer.findUnique({ where: { slotId_userId: { slotId: slot.slotId, userId: successor.id } }, select: { id: true } });
      if (!exists) await tx.slotInterviewer.update({ where: { id: slot.id }, data: { userId: successor.id } });
    }
    const groups = await tx.assessmentExpert.findMany({ where: { userId }, select: { groupId: true } });
    for (const group of groups) {
      await tx.assessmentExpert.upsert({
        where: { groupId_userId: { groupId: group.groupId, userId: successor.id } },
        create: { groupId: group.groupId, userId: successor.id },
        update: {},
      });
    }

    await tx.user.delete({ where: { id: userId } });
  });

  return { ok: true, name: check.name, moved: mine.length };
}
