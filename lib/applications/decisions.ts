import { db } from "~~/lib/db";
import type { DecisionOutcome } from "~~/lib/generated/prisma/enums";
import { notify } from "~~/lib/notifications/notify";

import { reviewSummary } from "./review";
import { fullName, initials, type EvaluatedStage } from "./staff";

/**
 * Решения по этапам: кто проходит дальше.
 *
 * Решение — черновик, пока его не опубликовали. Публикуется весь этап
 * одной кнопкой, и только тогда кандидаты видят результат и получают
 * уведомление. Так результаты не утекают по одному, пока организаторы
 * ещё спорят о пороге.
 *
 * Опубликованное решение не меняется: человек уже прочитал «вы прошли» —
 * забрать это обратно молча нельзя. Если ошиблись, разговор с кандидатом
 * ведут люди, а не кнопка.
 */

export interface RankRow {
  id: string;
  name: string;
  initials: string;
  telegramUsername: string | null;
  /** Средний итог по мастерам, поставившим хоть один балл. */
  average: number | null;
  max: number;
  /** Сколько мастеров проверили полностью и сколько назначено. */
  reviewed: number;
  reviewers: number;
  markers: string[];
  decision: DecisionOutcome | null;
  published: boolean;
}

/** Кто попадает в рейтинг этапа — те же правила, что у списков мастера. */
function eligible(stage: EvaluatedStage) {
  if (stage === "HOMEWORK") return { submissions: { some: { stageKind: "HOMEWORK" as const, replacedAt: null } } };
  if (stage === "INTERVIEW") return { reviews: { some: { stageKind: "INTERVIEW" as const } } };
  return {};
}

export async function rankForStage(seasonId: string, stage: EvaluatedStage): Promise<RankRow[]> {
  const [criteria, applications] = await Promise.all([
    db.criterion.findMany({ where: { seasonId, stageKind: stage }, select: { id: true, maxScore: true } }),
    db.application.findMany({
      where: { seasonId, status: "SUBMITTED", ...eligible(stage) },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        user: { select: { telegramUsername: true } },
        reviews: {
          where: { stageKind: stage },
          select: {
            scores: { select: { criterionId: true, score: true } },
            markers: { where: { note: { not: "" } }, select: { marker: { select: { title: true } } } },
          },
        },
        decisions: { where: { stageKind: stage }, select: { outcome: true, publishedAt: true } },
      },
    }),
  ]);

  const rows = applications.map((application): RankRow => {
    const summaries = application.reviews.map((review) => reviewSummary(criteria, review.scores));
    const totals = summaries.map((summary) => summary.total).filter((total): total is number => total !== null);
    const average = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null;
    const decision = application.decisions[0] ?? null;

    return {
      id: application.id,
      name: fullName(application),
      initials: initials(application),
      telegramUsername: application.user.telegramUsername,
      average,
      max: criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0),
      reviewed: summaries.filter((summary) => summary.status === "done").length,
      reviewers: summaries.length,
      markers: [...new Set(application.reviews.flatMap((review) => review.markers.map((item) => item.marker.title)))],
      decision: decision?.outcome ?? null,
      published: decision?.publishedAt != null,
    };
  });

  return rows.sort(
    (a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name, "ru"),
  );
}

export type DecisionResult = { ok: true } | { ok: false; message: string };

export async function setDecision(
  applicationId: string,
  stage: EvaluatedStage,
  outcome: DecisionOutcome | null,
  actorId: string,
): Promise<DecisionResult> {
  const existing = await db.stageDecision.findUnique({
    where: { applicationId_stageKind: { applicationId, stageKind: stage } },
    select: { publishedAt: true },
  });

  if (existing?.publishedAt) {
    return { ok: false, message: "Решение уже опубликовано — кандидат его видел. Изменить его нельзя." };
  }

  if (outcome === null) {
    await db.stageDecision.deleteMany({ where: { applicationId, stageKind: stage, publishedAt: null } });
    return { ok: true };
  }

  await db.stageDecision.upsert({
    where: { applicationId_stageKind: { applicationId, stageKind: stage } },
    create: { applicationId, stageKind: stage, outcome, decidedById: actorId },
    update: { outcome, decidedById: actorId, decidedAt: new Date() },
  });

  return { ok: true };
}

/** Что сказать кандидату о решении этапа. */
const MESSAGES: Record<EvaluatedStage, Record<DecisionOutcome, { title: string; body: string }>> = {
  APPLICATION: {
    PASSED: {
      title: "Анкета и домашнее задание приняты!",
      body: "Вы проходите дальше — следующий этап отбора. Подробности — в кабинете.",
    },
    REJECTED: {
      title: "Результаты анкеты",
      body: "В этот раз дальше пройти не получилось. Спасибо, что подали анкету, — приходите на следующий набор!",
    },
  },
  HOMEWORK: {
    PASSED: {
      title: "Вы прошли на собеседование!",
      body: "Выберите удобное время в кабинете — слоты разбирают быстро.",
    },
    REJECTED: {
      title: "Результаты домашнего задания",
      body: "В этот раз дальше пройти не получилось. Спасибо за работу — приходите на следующий набор!",
    },
  },
  INTERVIEW: {
    PASSED: {
      title: "Вы в Школе Актива!",
      body: "Поздравляем — вы прошли отбор. Подробности о старте пришлём в ближайшие дни.",
    },
    REJECTED: {
      title: "Итоги отбора",
      body: "В этот раз места не хватило. Спасибо, что прошли весь отбор, — будем рады видеть вас снова!",
    },
  },
};

/**
 * Опубликовать все ещё не опубликованные решения этапа.
 * Повторный вызов касается только новых — уже уведомлённым второй раз
 * ничего не придёт.
 */
export async function publishDecisions(
  seasonId: string,
  stage: EvaluatedStage,
): Promise<{ passed: number; rejected: number }> {
  const now = new Date();

  const pending = await db.stageDecision.findMany({
    where: { stageKind: stage, publishedAt: null, application: { seasonId } },
    select: { id: true, outcome: true, application: { select: { userId: true } } },
  });

  if (pending.length === 0) return { passed: 0, rejected: 0 };

  // Условие publishedAt: null — вторая одновременная публикация не
  // захватит те же решения и не пришлёт уведомление дважды.
  const { count } = await db.stageDecision.updateMany({
    where: { id: { in: pending.map((item) => item.id) }, publishedAt: null },
    data: { publishedAt: now },
  });
  if (count === 0) return { passed: 0, rejected: 0 };

  await notify(
    pending.map((decision) => ({
      userId: decision.application.userId,
      category: "SELECTION" as const,
      ...MESSAGES[stage][decision.outcome],
      url: "/cabinet",
      key: `decision:${decision.id}`,
    })),
  );

  return {
    passed: pending.filter((item) => item.outcome === "PASSED").length,
    rejected: pending.filter((item) => item.outcome === "REJECTED").length,
  };
}

/** Решение этапа глазами кандидата: только опубликованное. */
export async function candidateDecision(
  userId: string,
  seasonId: string,
  stage: EvaluatedStage,
): Promise<DecisionOutcome | null> {
  const decision = await db.stageDecision.findFirst({
    where: { stageKind: stage, publishedAt: { not: null }, application: { seasonId, userId } },
    select: { outcome: true },
  });
  return decision?.outcome ?? null;
}
