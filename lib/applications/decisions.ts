import { db } from "~~/lib/db";
import type { DecisionOutcome } from "~~/lib/generated/prisma/enums";
import { notify } from "~~/lib/notifications/notify";

import { reviewSummary } from "./review";
import { fullName, initials, type EvaluatedStage } from "./staff";

/**
 * Решения отбора.
 *
 * Допуск к записи на собеседование требует явки на ЦО (spec 017).
 * Итоговое решение одно — «Итоги отбора» в конце; хранится
 * оно как решение этапа INTERVIEW (`FINAL_STAGE`), а рейтинг итогов
 * (`rankFinal`) складывает средние баллы всех этапов.
 *
 * Решение — черновик, пока его не опубликовали. Публикуется весь этап
 * одной кнопкой, и только тогда кандидаты видят результат и получают
 * уведомление. Так результаты не утекают по одному, пока организаторы
 * ещё спорят о пороге.
 *
 * Опубликованное решение не меняется, кроме явного повышения из резерва
 * в прошедшие. Такое повышение записывается в журнал и уведомляет кандидата.
 */

/** Этап, решение которого — итог отбора. Других решений кандидат не получает. */
export const FINAL_STAGE = "INTERVIEW" satisfies EvaluatedStage;

/** Этапы, баллы которых складываются в итог. */
export const FINAL_PARTS = ["APPLICATION", "HOMEWORK", "ASSESSMENT", "INTERVIEW"] as const;
export type FinalPart = (typeof FINAL_PARTS)[number];

export interface RankPart {
  stage: FinalPart;
  average: number | null;
  max: number;
}

export interface RankRow {
  id: string;
  name: string;
  initials: string;
  telegramUsername: string | null;
  faculty?: string | null;
  assessmentPassed?: boolean;
  /** Средний итог по мастерам, поставившим хоть один балл. */
  average: number | null;
  max: number;
  /** Сколько мастеров проверили полностью и сколько назначено. */
  reviewed: number;
  reviewers: number;
  markers: string[];
  decision: DecisionOutcome | null;
  published: boolean;
  /** Итоги отбора: средний балл каждого этапа. */
  parts?: RankPart[];
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

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Рейтинг итогов: все отправившие анкету, средний балл каждого этапа и их
 * сумма. Этап без оценок в сумму не входит — у такого кандидата «—» в
 * колонке, а итог считается по остальным.
 */
export async function rankFinal(seasonId: string): Promise<RankRow[]> {
  const [criteria, applications] = await Promise.all([
    db.criterion.findMany({
      where: { seasonId, stageKind: { in: [...FINAL_PARTS] } },
      select: { id: true, maxScore: true, stageKind: true },
    }),
    db.application.findMany({
      where: { seasonId, status: "SUBMITTED" },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        user: { select: { telegramUsername: true, faculty: true } },
        assessmentInvite: { select: { attended: true } },
        reviews: {
          where: { stageKind: { in: [...FINAL_PARTS] } },
          select: {
            stageKind: true,
            scores: { select: { criterionId: true, score: true } },
            markers: { where: { note: { not: "" } }, select: { marker: { select: { title: true } } } },
          },
        },
        decisions: { where: { stageKind: FINAL_STAGE }, select: { outcome: true, publishedAt: true } },
      },
    }),
  ]);

  const criteriaOf = (stage: FinalPart) => criteria.filter((criterion) => criterion.stageKind === stage);
  const maxOf = (stage: FinalPart) => criteriaOf(stage).reduce((sum, criterion) => sum + criterion.maxScore, 0);

  const rows = applications.map((application): RankRow => {
    let reviewed = 0;
    let reviewers = 0;
    const parts = FINAL_PARTS.filter((stage) => maxOf(stage) > 0).map((stage): RankPart => {
      const summaries = application.reviews
        .filter((review) => review.stageKind === stage)
        .map((review) => reviewSummary(criteriaOf(stage), review.scores));
      reviewers += summaries.length;
      reviewed += summaries.filter((summary) => summary.status === "done").length;
      const totals = summaries.map((summary) => summary.total).filter((total): total is number => total !== null);
      return { stage, average: totals.length ? round(totals.reduce((a, b) => a + b, 0) / totals.length) : null, max: maxOf(stage) };
    });
    const scored = parts.filter((part) => part.average !== null);
    const decision = application.decisions[0] ?? null;

    return {
      id: application.id,
      name: fullName(application),
      initials: initials(application),
      telegramUsername: application.user.telegramUsername,
      faculty: application.user.faculty,
      assessmentPassed: application.assessmentInvite?.attended === true,
      average: scored.length ? round(scored.reduce((sum, part) => sum + part.average!, 0)) : null,
      max: parts.reduce((sum, part) => sum + part.max, 0),
      reviewed,
      reviewers,
      markers: [...new Set(application.reviews.flatMap((review) => review.markers.map((item) => item.marker.title)))],
      decision: decision?.outcome ?? null,
      published: decision?.publishedAt != null,
      parts,
    };
  });

  return rows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name, "ru"));
}

export type DecisionResult = { ok: true } | { ok: false; message: string };

export async function setDecision(
  applicationId: string,
  stage: EvaluatedStage,
  outcome: DecisionOutcome | null,
  actorId: string,
): Promise<DecisionResult> {
  if (outcome === "RESERVE" && stage !== FINAL_STAGE) {
    return { ok: false, message: "Резерв доступен только для итогов отбора." };
  }
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
    RESERVE: { title: "Результаты анкеты", body: "Вы в резерве отбора. О дальнейших шагах сообщим отдельно." },
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
    RESERVE: { title: "Результаты домашнего задания", body: "Вы в резерве отбора. О дальнейших шагах сообщим отдельно." },
  },
  INTERVIEW: {
    PASSED: {
      title: "Вы в Школе Актива!",
      body: "Поздравляем — вы прошли отбор. Подробности о старте пришлём в ближайшие дни.",
    },
    REJECTED: {
      title: "Итоги отбора",
      body: "Спасибо, что прошли весь отбор — анкету, центр оценки и собеседование 💛 В этот раз места в Школе Актива не хватило, и нам правда жаль 😔 Это не про то, что вы чего-то не умеете: мест мало, а сильных ребят много. Будем очень рады видеть вас в следующем наборе!",
    },
    RESERVE: {
      title: "Вы в резерве Школы Актива",
      body: "Вы успешно прошли отбор и вошли в резерв. Пока место не освободилось, участие не подтверждено. Если появится возможность пригласить вас, мы сообщим отдельно в личном кабинете и уведомлением.",
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
): Promise<{ passed: number; reserve: number; rejected: number }> {
  const now = new Date();

  const pending = await db.stageDecision.findMany({
    where: { stageKind: stage, publishedAt: null, application: { seasonId } },
    select: { id: true, outcome: true, application: { select: { userId: true } } },
  });

  if (pending.length === 0) return { passed: 0, reserve: 0, rejected: 0 };

  // Условие publishedAt: null — вторая одновременная публикация не
  // захватит те же решения и не пришлёт уведомление дважды.
  const { count } = await db.stageDecision.updateMany({
    where: { id: { in: pending.map((item) => item.id) }, publishedAt: null },
    data: { publishedAt: now },
  });
  if (count === 0) return { passed: 0, reserve: 0, rejected: 0 };

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
    reserve: pending.filter((item) => item.outcome === "RESERVE").length,
    rejected: pending.filter((item) => item.outcome === "REJECTED").length,
  };
}

/** Единственное допустимое изменение опубликованного итога: резерв → принят. */
export async function promoteReserve(applicationId: string, seasonId: string, actorId: string): Promise<DecisionResult & { userId?: string; decisionId?: string }> {
  const decision = await db.stageDecision.findUnique({
    where: { applicationId_stageKind: { applicationId, stageKind: FINAL_STAGE } },
    select: { id: true, outcome: true, publishedAt: true, application: { select: { userId: true, seasonId: true } } },
  });
  if (!decision || decision.application.seasonId !== seasonId || decision.outcome !== "RESERVE" || !decision.publishedAt) {
    return { ok: false, message: "Перевести можно только кандидата с опубликованным решением «Резерв»." };
  }
  // Условие в UPDATE не позволяет двум организаторам одновременно пригласить
  // одного и того же человека и дважды сообщить ему о переводе.
  const { count } = await db.stageDecision.updateMany({
    where: { id: decision.id, outcome: "RESERVE", publishedAt: { not: null } },
    data: { outcome: "PASSED", decidedById: actorId, decidedAt: new Date() },
  });
  if (!count) return { ok: false, message: "Кандидата уже перевели из резерва. Обновите список." };
  return { ok: true, userId: decision.application.userId, decisionId: decision.id };
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
