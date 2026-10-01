import { db } from "~~/lib/db";
import type { StageKind } from "~~/lib/generated/prisma/enums";

/**
 * Распределение анкет между мастерами.
 *
 * Отбор — единый поток: все, у кого есть право «оценивать анкеты», —
 * один пул. Новая анкета уходит тому, у кого сейчас меньше всего
 * назначений на этом этапе. Считаем все назначения, а не только
 * непроверенные: иначе быстрый мастер получал бы всё новые анкеты, пока
 * медленный копит свои, и нагрузка расползалась бы, а не выравнивалась.
 *
 * Владелец системы в пул не попадает сам по себе: у него все права, но
 * проверять анкеты он будет, только если ему выдали роль с этим правом.
 */

export interface ReviewerLoad {
  id: string;
  load: number;
}

/** Наименее загруженный; при равенстве — по id, чтобы результат не зависел от порядка. */
export function pickReviewer(loads: readonly ReviewerLoad[]): string | null {
  if (loads.length === 0) return null;

  return [...loads].sort((a, b) => a.load - b.load || a.id.localeCompare(b.id))[0]!.id;
}

/*
 * Назначение идёт под замком базы, одним на всю систему.
 *
 * Без него две анкеты, отправленные в одну секунду, посчитали бы одну и ту
 * же нагрузку и ушли бы одному мастеру. Замок транзакционный: снимается
 * сам, когда транзакция закончится, даже с ошибкой.
 */
const ASSIGN_LOCK = 918_273;

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function loads(tx: Tx, seasonId: string, stageKind: StageKind): Promise<ReviewerLoad[]> {
  const pool = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { some: { role: { permissions: { has: "applications.review" } } } },
    },
    select: { id: true },
  });

  if (pool.length === 0) return [];

  const counts = await tx.review.groupBy({
    by: ["reviewerId"],
    where: { stageKind, reviewerId: { in: pool.map((user) => user.id) }, application: { seasonId } },
    _count: { _all: true },
  });

  const byId = new Map(counts.map((row) => [row.reviewerId, row._count._all]));
  return pool.map((user) => ({ id: user.id, load: byId.get(user.id) ?? 0 }));
}

async function assignInside(
  tx: Tx,
  applicationId: string,
  stageKind: StageKind,
  assignedById: string | null,
  preferredReviewerId: string | null = null,
) {
  const existing = await tx.review.findFirst({
    where: { applicationId, stageKind },
    orderBy: { assignedAt: "asc" },
  });
  if (existing) return existing;

  const application = await tx.application.findUnique({
    where: { id: applicationId },
    select: { seasonId: true },
  });
  if (!application) return null;

  const pool = await loads(tx, application.seasonId, stageKind);
  // Предпочтительный — только если он всё ещё в пуле: не заблокирован и
  // не лишился права проверять.
  const reviewerId =
    preferredReviewerId && pool.some((item) => item.id === preferredReviewerId)
      ? preferredReviewerId
      : pickReviewer(pool);
  if (!reviewerId) return null;

  return tx.review.create({ data: { applicationId, stageKind, reviewerId, assignedById } });
}

/**
 * Назначить анкету мастеру, если она ещё никому не назначена.
 * Возвращает назначение (новое или прежнее) или null, если мастеров нет.
 */
export async function assignApplication(
  applicationId: string,
  stageKind: StageKind,
  assignedById: string | null,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ASSIGN_LOCK})`);
    return assignInside(tx, applicationId, stageKind, assignedById);
  });
}

/**
 * Назначить работу этапа (домашку) тому же мастеру, что проверял анкету:
 * он уже знает кандидата. Если его больше нет в пуле — по нагрузке.
 */
export async function assignFollowUp(applicationId: string, stageKind: StageKind) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ASSIGN_LOCK})`);
    const previous = await tx.review.findFirst({
      where: { applicationId, stageKind: "APPLICATION" },
      orderBy: { assignedAt: "asc" },
      select: { reviewerId: true },
    });
    return assignInside(tx, applicationId, stageKind, null, previous?.reviewerId ?? null);
  });
}

/**
 * Раздать все отправленные анкеты, у которых на этом этапе ещё нет мастера.
 * Возвращает id новых назначений — чтобы уведомить мастеров.
 */
export async function assignUnassigned(
  seasonId: string,
  stageKind: StageKind,
  assignedById: string | null,
): Promise<string[]> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ASSIGN_LOCK})`);

    const waiting = await tx.application.findMany({
      where: { seasonId, status: "SUBMITTED", reviews: { none: { stageKind } } },
      orderBy: { submittedAt: "asc" },
      select: { id: true },
    });

    const created: string[] = [];
    for (const application of waiting) {
      const review = await assignInside(tx, application.id, stageKind, assignedById);
      if (review) created.push(review.id);
    }
    return created;
  });
}

/**
 * Передать анкету другому мастеру.
 *
 * Передаётся сама запись оценки — вместе с уже поставленными баллами и
 * заметками: новый мастер видит, на чём остановился прежний. Если у
 * нового мастера эта анкета уже есть, ничего не меняем.
 */
export async function reassignApplication(applicationId: string, stageKind: StageKind, reviewerId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ASSIGN_LOCK})`);

    const already = await tx.review.findUnique({
      where: { applicationId_stageKind_reviewerId: { applicationId, stageKind, reviewerId } },
    });
    if (already) return already;

    const current = await tx.review.findFirst({
      where: { applicationId, stageKind },
      orderBy: { assignedAt: "asc" },
    });

    if (!current) {
      return tx.review.create({ data: { applicationId, stageKind, reviewerId } });
    }

    return tx.review.update({
      where: { id: current.id },
      data: { reviewerId, assignedAt: new Date() },
    });
  });
}
