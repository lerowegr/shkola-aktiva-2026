import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";

import { dayOf } from "./rules";

/**
 * Подгруппы центра оценки: внутри сбора, эксперты, кандидаты. Их видят только
 * организаторы и эксперты — кандидату показывают сбор (lib/assessment/sessions.ts).
 *
 * Оценка — обычная Review этапа ASSESSMENT, по одной на пару «эксперт
 * подгруппы × кандидат подгруппы». Заготовки создаются, как только пара
 * появилась: «моя подгруппа» на экране эксперта — это и есть его оценки.
 * Заготовку без единого балла и слова можно убрать молча, начатую — нет:
 * спор «кто поставил балл» решается записью.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const TITLE_MAX = 80;

export interface GroupInput {
  id?: string;
  /** Сбор — для новой подгруппы. */
  sessionId: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Заготовки оценок
// ---------------------------------------------------------------------------

/** Оценки для всех пар «эксперт × кандидат» группы, которых ещё нет. */
async function ensureReviews(groupId: string, actorId: string | null) {
  const group = await db.assessmentGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      experts: { select: { userId: true } },
      members: { select: { applicationId: true } },
    },
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

const untouched = {
  scores: { none: {} },
  markers: { none: {} },
  OR: [{ comment: null }, { comment: "" }],
};

/** Оценки кандидата после смены группы: новым экспертам — заготовки, пустые у прежних — убрать. */
export async function syncMemberReviews(
  applicationId: string,
  groupId: string | null,
  actorId: string | null,
) {
  const experts = groupId
    ? (
        await db.assessmentExpert.findMany({
          where: { groupId },
          select: { userId: true },
        })
      ).map((expert) => expert.userId)
    : [];
  await dropStaleReviews(applicationId, experts);
  if (groupId) await ensureReviews(groupId, actorId);
}

/** Убрать пустые заготовки кандидата у тех, кто больше не его эксперт. */
async function dropStaleReviews(
  applicationId: string,
  keepReviewers: string[],
) {
  await db.review.deleteMany({
    where: {
      applicationId,
      stageKind: "ASSESSMENT",
      reviewerId: { notIn: keepReviewers },
      ...untouched,
    },
  });
}

// ---------------------------------------------------------------------------
// Группы
// ---------------------------------------------------------------------------

export async function saveGroup(
  seasonId: string,
  input: GroupInput,
): Promise<Result<{ id: string; created: boolean }>> {
  const title = input.title.trim();
  if (!title)
    return {
      ok: false,
      message: "Назовите подгруппу — например, «Подгруппа 1».",
    };
  if (title.length > TITLE_MAX)
    return { ok: false, message: `Название — до ${TITLE_MAX} знаков.` };

  if (input.id) {
    const found = await db.assessmentGroup.findFirst({
      where: { id: input.id, seasonId },
      select: { id: true },
    });
    if (!found)
      return {
        ok: false,
        message: "Подгруппа не найдена — обновите страницу.",
      };
    await db.assessmentGroup.update({
      where: { id: found.id },
      data: { title },
    });
    return { ok: true, id: found.id, created: false };
  }

  const session = await db.assessmentSession.findFirst({
    where: { id: input.sessionId, seasonId },
    select: { id: true },
  });
  if (!session)
    return { ok: false, message: "Сбор не найден — обновите страницу." };
  const created = await db.assessmentGroup.create({
    data: { seasonId, sessionId: session.id, title },
    select: { id: true },
  });
  return { ok: true, id: created.id, created: true };
}

/**
 * Удалить подгруппу — и с кандидатами. Как при переносе: кандидаты становятся
 * нераспределёнными, пустые заготовки оценок убираются, начатые остаются
 * (баллы не пропадают — их видно в карточке).
 */
export async function deleteGroup(
  seasonId: string,
  groupId: string,
): Promise<Result<{ title: string; members: number; kept: number }>> {
  const group = await db.assessmentGroup.findFirst({
    where: { id: groupId, seasonId },
    select: {
      id: true,
      title: true,
      experts: { select: { userId: true } },
      members: { select: { applicationId: true } },
    },
  });
  if (!group)
    return { ok: false, message: "Группа не найдена — обновите страницу." };

  const applicationIds = group.members.map((member) => member.applicationId);
  const experts = group.experts.map((expert) => expert.userId);
  await db.$transaction([
    db.review.deleteMany({
      where: {
        stageKind: "ASSESSMENT",
        applicationId: { in: applicationIds },
        reviewerId: { in: experts },
        ...untouched,
      },
    }),
    // Участники и эксперты уходят каскадом вместе с группой.
    db.assessmentGroup.delete({ where: { id: group.id } }),
  ]);
  const kept = await db.review.count({
    where: {
      stageKind: "ASSESSMENT",
      applicationId: { in: applicationIds },
      reviewerId: { in: experts },
    },
  });

  return { ok: true, title: group.title, members: applicationIds.length, kept };
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
    select: {
      id: true,
      experts: { select: { userId: true } },
      members: { select: { applicationId: true } },
    },
  });
  if (!group)
    return { ok: false, message: "Группа не найдена — обновите страницу." };

  const wanted = [...new Set(userIds)];
  const valid = await db.user.findMany({
    where: {
      id: { in: wanted },
      status: "ACTIVE",
      roles: {
        some: { role: { permissions: { has: "applications.review" } } },
      },
    },
    select: { id: true },
  });
  if (valid.length !== wanted.length)
    return {
      ok: false,
      message: "Оценивать могут только мастера отбора — обновите список.",
    };

  const current = group.experts.map((expert) => expert.userId);
  const added = wanted.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !wanted.includes(id));

  if (removed.length) {
    const started = await db.review.findFirst({
      where: {
        stageKind: "ASSESSMENT",
        reviewerId: { in: removed },
        applicationId: {
          in: group.members.map((member) => member.applicationId),
        },
        NOT: untouched,
      },
      select: {
        reviewer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            telegramUsername: true,
          },
        },
      },
    });
    if (started) {
      return {
        ok: false,
        message: `${displayName(started.reviewer)} уже оценивает кандидатов этой группы — снять нельзя: оценки пропали бы.`,
      };
    }
  }

  await db.$transaction([
    db.assessmentExpert.deleteMany({
      where: { groupId: group.id, userId: { in: removed } },
    }),
    db.assessmentExpert.createMany({
      data: added.map((userId) => ({ groupId: group.id, userId })),
      skipDuplicates: true,
    }),
    db.review.deleteMany({
      where: {
        stageKind: "ASSESSMENT",
        reviewerId: { in: removed },
        applicationId: {
          in: group.members.map((member) => member.applicationId),
        },
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

/**
 * Положить кандидата в подгруппу, перенести или убрать (groupId = null).
 * Кладут вживую в день ЦО — значит, кандидат пришёл: отметка «пришёл»
 * ставится сама. Пришедшего без ответа «Буду» тоже можно распределить.
 */
export async function placeMember(
  seasonId: string,
  applicationId: string,
  groupId: string | null,
  actorId: string | null,
): Promise<Result<{ from: string | null; to: string | null; kept: number }>> {
  const application = await db.application.findFirst({
    where: { id: applicationId, seasonId, status: "SUBMITTED" },
    select: {
      id: true,
      assessment: { select: { group: { select: { id: true, title: true } } } },
    },
  });
  if (!application)
    return { ok: false, message: "Кандидат не найден — обновите страницу." };

  const from = application.assessment?.group ?? null;
  let to: { id: string; title: string; experts: { userId: string }[] } | null =
    null;
  if (groupId) {
    const found = await db.assessmentGroup.findFirst({
      where: { id: groupId, seasonId },
      select: {
        id: true,
        title: true,
        sessionId: true,
        experts: { select: { userId: true } },
      },
    });
    if (!found)
      return {
        ok: false,
        message: "Подгруппа не найдена — обновите страницу.",
      };
    // В подгруппу — только своего дня: сбор, на который пригласили, или резервный.
    if (found.sessionId) {
      const [invite, reserve] = await Promise.all([
        db.assessmentInvite.findUnique({
          where: { applicationId },
          select: { sessionId: true, answer: true, reserveQueued: true },
        }),
        db.assessmentSession.findFirst({
          where: { seasonId, reserve: true },
          select: { id: true },
        }),
      ]);
      if (!invite)
        return {
          ok: false,
          message:
            "Кандидат не приглашён на центр оценки — сначала пригласите его на сбор.",
        };
      // Ответивший «не смогу», но пришедший, — в подгруппу своего сбора.
      const day =
        invite.answer === "CANT"
          ? invite.sessionId
          : dayOf(invite, reserve?.id ?? null);
      if (day !== found.sessionId) {
        return {
          ok: false,
          message:
            "Этот кандидат придёт в другой день — положите его в подгруппу того сбора.",
        };
      }
    }
    to = found;
  }
  if (from?.id === to?.id)
    return {
      ok: true,
      from: from?.title ?? null,
      to: to?.title ?? null,
      kept: 0,
    };

  if (to) {
    await db.assessmentMember.upsert({
      where: { applicationId },
      create: { applicationId, groupId: to.id },
      update: { groupId: to.id, addedAt: new Date() },
    });
  } else {
    await db.assessmentMember.deleteMany({ where: { applicationId } });
  }

  await dropStaleReviews(
    applicationId,
    to?.experts.map((expert) => expert.userId) ?? [],
  );
  if (to) {
    await ensureReviews(to.id, actorId);
    await db.assessmentInvite.updateMany({
      where: { applicationId },
      data: { attended: true },
    });
  }

  // Начатые оценки прежних экспертов остаются — организатор должен это знать.
  const kept = await db.review.count({
    where: {
      applicationId,
      stageKind: "ASSESSMENT",
      reviewerId: { notIn: to?.experts.map((expert) => expert.userId) ?? [] },
    },
  });

  return { ok: true, from: from?.title ?? null, to: to?.title ?? null, kept };
}
