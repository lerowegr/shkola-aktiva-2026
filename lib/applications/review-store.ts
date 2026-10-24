import { writeAudit } from "~~/lib/audit";
import { loadUser } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import type { StageKind } from "~~/lib/generated/prisma/enums";
import { can } from "~~/lib/permissions";

import { allowedScores, validScore } from "./review";

/**
 * Сохранение оценки: баллы, маркеры, комментарий.
 *
 * Кнопки «Сохранить» нет — каждое нажатие и каждая пауза в наборе
 * сохраняются сразу. Поэтому правила здесь строгие и в одном месте:
 * менять оценку может только тот, кому она назначена, а балл обязан
 * укладываться в шкалу критерия.
 *
 * Аудит. Каждый балл — отдельная запись: это и есть решение о кандидате.
 * Текст маркеров и комментария сохраняется на каждую паузу в наборе, и
 * запись в журнал на каждую — это сотни строк на одну анкету. Поэтому
 * текстовые правки попадают в журнал не чаще раза в 5 минут на поле: видно,
 * кто и когда правил, а не каждую букву.
 */

export const TEXT_MAX = 2000;
const TEXT_AUDIT_EVERY_MS = 5 * 60 * 1000;

export type SaveResult = { ok: true; updatedAt: Date } | { ok: false; message: string };

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

async function ownReview(reviewId: string, actorId: string) {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      applicationId: true,
      reviewerId: true,
      stageKind: true,
      releasedAt: true,
      application: { select: { seasonId: true } },
    },
  });

  if (!review) return { ok: false as const, message: "Оценка не найдена — обновите страницу." };
  if (review.releasedAt) {
    return { ok: false as const, message: "Оценка возвращена на биржу — только чтение." };
  }
  if (review.reviewerId !== actorId) {
    return { ok: false as const, message: "Эта анкета назначена другому мастеру — её можно только смотреть." };
  }
  return { ok: true as const, review };
}

export async function saveScore(
  params: { reviewId: string; actorId: string; criterionId: string; score: number | null },
  context: AuditContext = {},
): Promise<SaveResult> {
  const own = await ownReview(params.reviewId, params.actorId);
  if (!own.ok) return own;

  const criterion = await db.criterion.findFirst({
    where: {
      id: params.criterionId,
      seasonId: own.review.application.seasonId,
      stageKind: own.review.stageKind,
    },
    select: { id: true, title: true, maxScore: true, levels: true },
  });
  if (!criterion) return { ok: false, message: "Критерий не найден — обновите страницу." };

  const shape = { maxScore: criterion.maxScore, levels: criterion.levels as { score: number; text: string }[] };
  if (params.score !== null && !validScore(shape, params.score)) {
    return { ok: false, message: `По «${criterion.title}» можно поставить только ${allowedScores(shape).join(", ")}.` };
  }

  const key = { reviewId_criterionId: { reviewId: params.reviewId, criterionId: criterion.id } };
  const before = await db.reviewScore.findUnique({ where: key, select: { score: true } });

  if ((before?.score ?? null) === params.score) {
    const review = await db.review.findUniqueOrThrow({ where: { id: params.reviewId }, select: { updatedAt: true } });
    return { ok: true, updatedAt: review.updatedAt };
  }

  const review = await db.$transaction(async (tx) => {
    if (params.score === null) {
      await tx.reviewScore.deleteMany({ where: { reviewId: params.reviewId, criterionId: criterion.id } });
    } else {
      await tx.reviewScore.upsert({
        where: key,
        create: { reviewId: params.reviewId, criterionId: criterion.id, score: params.score },
        update: { score: params.score },
      });
    }
    return tx.review.update({
      where: { id: params.reviewId },
      data: { updatedById: params.actorId },
      select: { updatedAt: true },
    });
  });

  await writeAudit({
    actorId: params.actorId,
    action: "review.score",
    entityType: "review",
    entityId: params.reviewId,
    meta: { criterion: criterion.title, from: before?.score ?? null, to: params.score },
    ...context,
  });

  return { ok: true, updatedAt: review.updatedAt };
}

/** field — "comment" или id маркера. */
export async function saveText(
  params: { reviewId: string; actorId: string; field: string; value: string },
  context: AuditContext = {},
): Promise<SaveResult> {
  const own = await ownReview(params.reviewId, params.actorId);
  if (!own.ok) return own;

  if (params.value.length > TEXT_MAX) {
    return { ok: false, message: `Не длиннее ${TEXT_MAX} знаков — сократите текст.` };
  }

  let label = "Комментарий";

  const review = await db.$transaction(async (tx) => {
    if (params.field === "comment") {
      return tx.review.update({
        where: { id: params.reviewId },
        data: { comment: params.value, updatedById: params.actorId },
        select: { updatedAt: true },
      });
    }

    const marker = await tx.marker.findFirst({
      where: {
        id: params.field,
        seasonId: own.review.application.seasonId,
        stageKind: own.review.stageKind,
      },
      select: { id: true, title: true },
    });
    if (!marker) return null;
    label = marker.title;

    const key = { reviewId_markerId: { reviewId: params.reviewId, markerId: marker.id } };
    if (params.value.trim() === "") {
      await tx.reviewMarker.deleteMany({ where: { reviewId: params.reviewId, markerId: marker.id } });
    } else {
      await tx.reviewMarker.upsert({
        where: key,
        create: { reviewId: params.reviewId, markerId: marker.id, note: params.value },
        update: { note: params.value },
      });
    }

    return tx.review.update({
      where: { id: params.reviewId },
      data: { updatedById: params.actorId },
      select: { updatedAt: true },
    });
  });

  if (!review) return { ok: false, message: "Маркер не найден — обновите страницу." };

  const recent = await db.auditLog.findFirst({
    where: {
      actorId: params.actorId,
      action: "review.text",
      entityId: params.reviewId,
      createdAt: { gt: new Date(Date.now() - TEXT_AUDIT_EVERY_MS) },
      meta: { path: ["field"], equals: params.field },
    },
    select: { id: true },
  });

  if (!recent) {
    await writeAudit({
      actorId: params.actorId,
      action: "review.text",
      entityType: "review",
      entityId: params.reviewId,
      meta: { field: params.field, label },
      ...context,
    });
  }

  return { ok: true, updatedAt: review.updatedAt };
}

// ---------------------------------------------------------------------------
// Биржа: взять, передать, вернуть
// ---------------------------------------------------------------------------

export type BookingResult = { ok: true; reviewId: string } | { ok: false; message: string };

async function activeOwnReview(applicationId: string, stageKind: StageKind, actorId: string) {
  return db.review.findUnique({
    where: { applicationId_stageKind_reviewerId: { applicationId, stageKind, reviewerId: actorId } },
    select: { id: true, releasedAt: true },
  });
}

/**
 * Взять анкету на проверку: бронь за мастером. Брать можно только
 * отправленную; чужие брони не мешают — параллельные оценки были всегда,
 * holders видны в карточке. Повторный вызов возвращает ту же строку.
 */
export async function takeReview(
  params: { applicationId: string; stageKind: StageKind; actorId: string },
  context: AuditContext = {},
): Promise<BookingResult> {
  const application = await db.application.findUnique({
    where: { id: params.applicationId },
    select: { id: true, status: true, lastName: true, firstName: true },
  });
  if (!application || application.status !== "SUBMITTED") {
    return { ok: false, message: "Брать на проверку можно только отправленную анкету." };
  }

  const existing = await activeOwnReview(params.applicationId, params.stageKind, params.actorId);
  if (existing && !existing.releasedAt) return { ok: true, reviewId: existing.id };

  try {
    const review = await db.review.create({
      data: {
        applicationId: params.applicationId,
        stageKind: params.stageKind,
        reviewerId: params.actorId,
        assignedById: params.actorId,
      },
      select: { id: true },
    });
    await writeAudit({
      actorId: params.actorId,
      action: "review.take",
      entityType: "review",
      entityId: review.id,
      meta: { applicationId: params.applicationId, stageKind: params.stageKind },
      ...context,
    });
    return { ok: true, reviewId: review.id };
  } catch {
    // Гонка двух «взять» одновременно: unique отдаёт победу одному,
    // второй забирает свою строку.
    const retry = await activeOwnReview(params.applicationId, params.stageKind, params.actorId);
    if (retry && !retry.releasedAt) return { ok: true, reviewId: retry.id };
    return { ok: false, message: "Не получилось взять — обновите страницу." };
  }
}

/** Передать свою активную оценку другому мастеру — вместе с баллами. */
export async function transferReview(
  params: { reviewId: string; actorId: string; toUserId: string },
  context: AuditContext = {},
): Promise<BookingResult> {
  const own = await ownReview(params.reviewId, params.actorId);
  if (!own.ok) return own;
  if (params.toUserId === params.actorId) {
    return { ok: false, message: "Оценка уже ваша — передавать некому." };
  }

  const target = await loadUser(params.toUserId);
  if (!target || !target.isActive || (!target.isOwner && !can(target, "applications.review"))) {
    return { ok: false, message: "Передать можно только активному мастеру отбора." };
  }
  const clash = await db.review.findUnique({
    where: {
      applicationId_stageKind_reviewerId: {
        applicationId: own.review.applicationId,
        stageKind: own.review.stageKind,
        reviewerId: params.toUserId,
      },
    },
    select: { id: true, releasedAt: true },
  });
  if (clash && !clash.releasedAt) {
    return { ok: false, message: "У этого мастера уже есть оценка этой анкеты." };
  }

  await db.review.update({
    where: { id: params.reviewId },
    data: { reviewerId: params.toUserId, assignedById: params.actorId, updatedById: params.actorId },
  });
  await writeAudit({
    actorId: params.actorId,
    action: "review.transfer",
    entityType: "review",
    entityId: params.reviewId,
    meta: { toUserId: params.toUserId, toName: target.name },
    ...context,
  });
  return { ok: true, reviewId: params.reviewId };
}

/**
 * Вернуть оценку на биржу. Без сохранения — строка удаляется вместе
 * с баллами; с сохранением — замораживается: видна всем, менять не может
 * никто, бронь освобождается.
 */
export async function releaseReview(
  params: { reviewId: string; actorId: string; keep: boolean },
  context: AuditContext = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const own = await ownReview(params.reviewId, params.actorId);
  if (!own.ok) return own;

  if (params.keep) {
    await db.review.update({ where: { id: params.reviewId }, data: { releasedAt: new Date(), updatedById: params.actorId } });
  } else {
    await db.review.delete({ where: { id: params.reviewId } });
  }
  await writeAudit({
    actorId: params.actorId,
    action: "review.release",
    entityType: "review",
    entityId: params.reviewId,
    meta: { kept: params.keep },
    ...context,
  });
  return { ok: true };
}
