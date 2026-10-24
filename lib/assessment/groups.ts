import { fullName } from "~~/lib/applications/staff";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";

import { balance, placeChanged, placeLine, placeOf, placeProblem, readPlace } from "./rules";

/**
 * Группы центра оценки: место и время, эксперты, кандидаты.
 *
 * Оценка — обычная Review этапа ASSESSMENT, по одной на пару «эксперт
 * группы × кандидат группы». Заготовки создаются, как только пара
 * появилась: «моя группа» на экране эксперта — это и есть его оценки.
 * Заготовку без единого балла и слова можно убрать молча, начатую — нет:
 * спор «кто поставил балл» решается записью.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const TITLE_MAX = 80;
const FIELD_MAX = 120;
const NOTE_MAX = 500;

export interface GroupInput {
  id?: string;
  title: string;
  building: string;
  room: string;
  startsAt: string | null;
  note: string;
}

// ---------------------------------------------------------------------------
// Заготовки оценок
// ---------------------------------------------------------------------------

/** Оценки для всех пар «эксперт × кандидат» группы, которых ещё нет. */
async function ensureReviews(groupId: string, actorId: string | null) {
  const group = await db.assessmentGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { experts: { select: { userId: true } }, members: { select: { applicationId: true } } },
  });
  const data = group.experts.flatMap((expert) =>
    group.members.map((member) => ({
      applicationId: member.applicationId,
      stageKind: "ASSESSMENT" as const,
      reviewerId: expert.userId,
      assignedById: actorId,
    })),
  );
  if (data.length) await db.review.createMany({ data, skipDuplicates: true });
}

const untouched = { scores: { none: {} }, markers: { none: {} }, OR: [{ comment: null }, { comment: "" }] };

/** Убрать пустые заготовки кандидата у тех, кто больше не его эксперт. */
async function dropStaleReviews(applicationId: string, keepReviewers: string[]) {
  await db.review.deleteMany({
    where: { applicationId, stageKind: "ASSESSMENT", reviewerId: { notIn: keepReviewers }, ...untouched },
  });
}

// ---------------------------------------------------------------------------
// Группы
// ---------------------------------------------------------------------------

export async function saveGroup(seasonId: string, input: GroupInput): Promise<Result<{ id: string; created: boolean }>> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Назовите группу — например, «Группа 1»." };
  if (title.length > TITLE_MAX) return { ok: false, message: `Название — до ${TITLE_MAX} знаков.` };
  if (input.building.length > FIELD_MAX || input.room.length > FIELD_MAX) {
    return { ok: false, message: `Корпус и аудитория — до ${FIELD_MAX} знаков.` };
  }
  if (input.note.length > NOTE_MAX) return { ok: false, message: `Заметка — до ${NOTE_MAX} знаков.` };

  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) return { ok: false, message: "Дата и время указаны неверно." };

  const data = {
    title,
    building: input.building.trim() || null,
    room: input.room.trim() || null,
    startsAt,
    note: input.note.trim() || null,
  };

  if (input.id) {
    const found = await db.assessmentGroup.findFirst({ where: { id: input.id, seasonId }, select: { id: true } });
    if (!found) return { ok: false, message: "Группа не найдена — обновите страницу." };
    await db.assessmentGroup.update({ where: { id: found.id }, data });
    return { ok: true, id: found.id, created: false };
  }

  const created = await db.assessmentGroup.create({ data: { ...data, seasonId }, select: { id: true } });
  return { ok: true, id: created.id, created: true };
}

/**
 * Удалить группу — и с кандидатами. Как при переносе: кандидаты уходят в
 * «Без группы», пустые заготовки оценок убираются, начатые остаются (баллы
 * не пропадают — их видно в карточке). Если группе уже сообщали место,
 * кандидаты его больше не видят: им нужно сообщить новое.
 */
export async function deleteGroup(
  seasonId: string,
  groupId: string,
): Promise<Result<{ title: string; members: number; kept: number; notified: boolean }>> {
  const group = await db.assessmentGroup.findFirst({
    where: { id: groupId, seasonId },
    select: { id: true, title: true, notifiedAt: true, experts: { select: { userId: true } }, members: { select: { applicationId: true } } },
  });
  if (!group) return { ok: false, message: "Группа не найдена — обновите страницу." };

  const applicationIds = group.members.map((member) => member.applicationId);
  const experts = group.experts.map((expert) => expert.userId);
  await db.$transaction([
    db.review.deleteMany({
      where: { stageKind: "ASSESSMENT", applicationId: { in: applicationIds }, reviewerId: { in: experts }, ...untouched },
    }),
    // Участники и эксперты уходят каскадом вместе с группой.
    db.assessmentGroup.delete({ where: { id: group.id } }),
  ]);
  const kept = await db.review.count({ where: { stageKind: "ASSESSMENT", applicationId: { in: applicationIds }, reviewerId: { in: experts } } });

  return { ok: true, title: group.title, members: applicationIds.length, kept, notified: group.notifiedAt !== null };
}

/** Эксперты группы целиком: кого нет в списке — снимается. */
export async function setExperts(
  seasonId: string,
  groupId: string,
  userIds: string[],
  actorId: string,
): Promise<Result<{ added: string[]; removed: string[] }>> {
  const group = await db.assessmentGroup.findFirst({
    where: { id: groupId, seasonId },
    select: { id: true, experts: { select: { userId: true } }, members: { select: { applicationId: true } } },
  });
  if (!group) return { ok: false, message: "Группа не найдена — обновите страницу." };

  const wanted = [...new Set(userIds)];
  const valid = await db.user.findMany({
    where: { id: { in: wanted }, status: "ACTIVE", roles: { some: { role: { permissions: { has: "applications.review" } } } } },
    select: { id: true },
  });
  if (valid.length !== wanted.length) return { ok: false, message: "Оценивать могут только мастера отбора — обновите список." };

  const current = group.experts.map((expert) => expert.userId);
  const added = wanted.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !wanted.includes(id));

  if (removed.length) {
    const started = await db.review.findFirst({
      where: {
        stageKind: "ASSESSMENT",
        reviewerId: { in: removed },
        applicationId: { in: group.members.map((member) => member.applicationId) },
        NOT: untouched,
      },
      select: { reviewer: { select: { firstName: true, lastName: true, email: true, telegramUsername: true } } },
    });
    if (started) {
      return {
        ok: false,
        message: `${displayName(started.reviewer)} уже оценивает кандидатов этой группы — снять нельзя: оценки пропали бы.`,
      };
    }
  }

  await db.$transaction([
    db.assessmentExpert.deleteMany({ where: { groupId: group.id, userId: { in: removed } } }),
    db.assessmentExpert.createMany({ data: added.map((userId) => ({ groupId: group.id, userId })), skipDuplicates: true }),
    db.review.deleteMany({
      where: {
        stageKind: "ASSESSMENT",
        reviewerId: { in: removed },
        applicationId: { in: group.members.map((member) => member.applicationId) },
        ...untouched,
      },
    }),
  ]);
  await ensureReviews(group.id, actorId);

  return { ok: true, added, removed };
}

// ---------------------------------------------------------------------------
// Кандидаты
// ---------------------------------------------------------------------------

/** Положить кандидата в группу, перенести или убрать (groupId = null). */
export async function placeMember(
  seasonId: string,
  applicationId: string,
  groupId: string | null,
  actorId: string | null,
): Promise<Result<{ from: string | null; to: string | null; kept: number }>> {
  const application = await db.application.findFirst({
    where: { id: applicationId, seasonId, status: "SUBMITTED" },
    select: { id: true, assessment: { select: { group: { select: { id: true, title: true } } } } },
  });
  if (!application) return { ok: false, message: "Кандидат не найден — обновите страницу." };

  const from = application.assessment?.group ?? null;
  let to: { id: string; title: string; experts: { userId: string }[] } | null = null;
  if (groupId) {
    to = await db.assessmentGroup.findFirst({
      where: { id: groupId, seasonId },
      select: { id: true, title: true, experts: { select: { userId: true } } },
    });
    if (!to) return { ok: false, message: "Группа не найдена — обновите страницу." };
  }
  if (from?.id === to?.id) return { ok: true, from: from?.title ?? null, to: to?.title ?? null, kept: 0 };

  if (to) {
    await db.assessmentMember.upsert({
      where: { applicationId },
      create: { applicationId, groupId: to.id },
      update: { groupId: to.id, addedAt: new Date() },
    });
  } else {
    await db.assessmentMember.deleteMany({ where: { applicationId } });
  }

  await dropStaleReviews(applicationId, to?.experts.map((expert) => expert.userId) ?? []);
  if (to) await ensureReviews(to.id, actorId);

  // Начатые оценки прежних экспертов остаются — организатор должен это знать.
  const kept = await db.review.count({
    where: { applicationId, stageKind: "ASSESSMENT", reviewerId: { notIn: to?.experts.map((expert) => expert.userId) ?? [] } },
  });

  return { ok: true, from: from?.title ?? null, to: to?.title ?? null, kept };
}

/** Кандидаты без группы — поровну по группам. */
export async function distribute(seasonId: string, actorId: string): Promise<Result<{ placed: number }>> {
  const groups = await db.assessmentGroup.findMany({
    where: { seasonId },
    orderBy: [{ startsAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: { id: true, _count: { select: { members: true } } },
  });
  if (groups.length === 0) return { ok: false, message: "Сначала создайте хотя бы одну группу." };

  const free = await db.application.findMany({
    where: { seasonId, status: "SUBMITTED", assessment: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (free.length === 0) return { ok: false, message: "Все кандидаты уже в группах." };

  const placed = balance(
    groups.map((group) => ({ id: group.id, size: group._count.members })),
    free.map((application) => application.id),
  );
  await db.assessmentMember.createMany({
    data: [...placed].map(([applicationId, groupId]) => ({ applicationId, groupId })),
    skipDuplicates: true,
  });
  for (const group of groups) await ensureReviews(group.id, actorId);

  return { ok: true, placed: placed.size };
}

// ---------------------------------------------------------------------------
// Рассылка места
// ---------------------------------------------------------------------------

function when(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(iso));
}

/** Сообщить кандидатам группы место и время. Снимок места — то, что они увидят. */
export async function notifyGroup(seasonId: string, groupId: string): Promise<Result<{ sent: number; repeat: boolean; title: string }>> {
  const group = await db.assessmentGroup.findFirst({
    where: { id: groupId, seasonId },
    select: {
      id: true,
      title: true,
      building: true,
      room: true,
      startsAt: true,
      note: true,
      notified: true,
      members: { select: { application: { select: { userId: true } } } },
    },
  });
  if (!group) return { ok: false, message: "Группа не найдена — обновите страницу." };

  const place = placeOf(group);
  const problem = placeProblem(place);
  if (problem) return { ok: false, message: problem };
  if (group.members.length === 0) return { ok: false, message: "В группе пока нет кандидатов — сообщать некому." };

  const previous = readPlace(group.notified);
  if (previous && !placeChanged(previous, place)) {
    return { ok: false, message: "Группе уже сообщили ровно это место и время." };
  }

  const now = new Date();
  await db.assessmentGroup.update({ where: { id: group.id }, data: { notified: { ...place }, notifiedAt: now } });

  const body = [`${placeLine(place)}. ${when(place.startsAt!)} (МСК).`, place.note].filter(Boolean).join("\n");
  const sent = await notify(
    group.members.map((member) => ({
      userId: member.application.userId,
      category: "SELECTION" as const,
      title: previous ? "Центр оценки: изменилось место или время" : "Центр оценки: где и когда",
      body,
      url: "/cabinet",
      key: `assessment:${group.id}:${now.getTime()}:${member.application.userId}`,
    })),
  );

  return { ok: true, sent, repeat: Boolean(previous), title: group.title };
}

// ---------------------------------------------------------------------------
// Чтение
// ---------------------------------------------------------------------------

export interface AssessmentGroupRow {
  id: string;
  title: string;
  building: string | null;
  room: string | null;
  startsAt: Date | null;
  note: string | null;
  notifiedAt: Date | null;
  /** Место поменялось после рассылки. */
  stale: boolean;
  experts: { id: string; name: string }[];
  members: { applicationId: string; name: string; faculty: string | null; done: number; total: number }[];
}

export interface AssessmentOverview {
  groups: AssessmentGroupRow[];
  free: { applicationId: string; name: string; faculty: string | null }[];
}

/** Все группы сезона, или только те, где viewer — эксперт. */
export async function loadGroups(seasonId: string, onlyExpert?: string): Promise<AssessmentOverview> {
  const [groups, criteria] = await Promise.all([
    db.assessmentGroup.findMany({
      where: { seasonId, ...(onlyExpert ? { experts: { some: { userId: onlyExpert } } } : {}) },
      orderBy: [{ startsAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        building: true,
        room: true,
        startsAt: true,
        note: true,
        notified: true,
        notifiedAt: true,
        experts: { select: { user: { select: { id: true, firstName: true, lastName: true, email: true, telegramUsername: true } } } },
        members: {
          orderBy: [{ application: { lastName: "asc" } }, { application: { firstName: "asc" } }],
          select: {
            application: {
              select: {
                id: true,
                lastName: true,
                firstName: true,
                middleName: true,
                user: { select: { faculty: true } },
                reviews: {
                  where: { stageKind: "ASSESSMENT" },
                  select: { reviewerId: true, _count: { select: { scores: true } } },
                },
              },
            },
          },
        },
      },
    }),
    db.criterion.count({ where: { seasonId, stageKind: "ASSESSMENT" } }),
  ]);

  const rows = groups.map((group) => {
    const experts = group.experts.map((expert) => expert.user.id);
    return {
      id: group.id,
      title: group.title,
      building: group.building,
      room: group.room,
      startsAt: group.startsAt,
      note: group.note,
      notifiedAt: group.notifiedAt,
      stale: placeChanged(readPlace(group.notified), placeOf(group)),
      experts: group.experts
        .map((expert) => ({ id: expert.user.id, name: displayName(expert.user) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
      members: group.members.map(({ application }) => {
        // «Оценён» — полностью, по каждому критерию, и только экспертами этой группы.
        const relevant = application.reviews.filter((review) =>
          onlyExpert ? review.reviewerId === onlyExpert : experts.includes(review.reviewerId),
        );
        return {
          applicationId: application.id,
          name: fullName(application),
          faculty: application.user.faculty,
          done: relevant.filter((review) => criteria > 0 && review._count.scores >= criteria).length,
          total: relevant.length,
        };
      }),
    };
  });

  if (onlyExpert) return { groups: rows, free: [] };

  const free = await db.application.findMany({
    where: { seasonId, status: "SUBMITTED", assessment: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true, middleName: true, user: { select: { faculty: true } } },
  });

  return {
    groups: rows,
    free: free.map((application) => ({ applicationId: application.id, name: fullName(application), faculty: application.user.faculty })),
  };
}
