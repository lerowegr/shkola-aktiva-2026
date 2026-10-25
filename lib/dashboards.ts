import { db } from "~~/lib/db";
import type { StageKind } from "~~/lib/generated/prisma/enums";

import { reviewSummary } from "./applications/review";
import { displayName } from "./auth/actor";

/**
 * Цифры для дашбордов. Только чтение и подсчёт: кто вправе смотреть,
 * решает обработчик. Дни считаются по Москве — «заявки за вторник» должны
 * быть заявками за московский вторник, где бы ни стоял сервер.
 */
type Evaluated = Extract<StageKind, "APPLICATION" | "HOMEWORK" | "INTERVIEW">;

const published = (stage: Evaluated, outcome: "PASSED" | "REJECTED") => ({
  decisions: { some: { stageKind: stage, outcome, publishedAt: { not: null } } },
});

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

export async function funnel(seasonId: string): Promise<FunnelStep[]> {
  const count = (where: object) => db.application.count({ where: { seasonId, ...where } });

  // Отсева между этапами нет: воронка — кто дошёл до какого шага.
  const [registered, started, submitted, homework, assessment, booked, accepted] = await Promise.all([
    db.user.count({ where: { isOwner: false, roles: { none: {} } } }),
    count({}),
    count({ status: "SUBMITTED" }),
    count({ submissions: { some: { stageKind: "HOMEWORK", replacedAt: null } } }),
    count({ assessmentInvite: { is: { answer: { in: ["GOING", "RESERVE"] } } } }),
    count({ bookings: { some: { cancelledAt: null } } }),
    count(published("INTERVIEW", "PASSED")),
  ]);

  return [
    { key: "registered", label: "Вошли на сайт", count: registered },
    { key: "started", label: "Начали анкету", count: started },
    { key: "submitted", label: "Отправили анкету", count: submitted },
    { key: "homework", label: "Сдали ДЗ", count: homework },
    { key: "assessment", label: "Придут на ЦО", count: assessment },
    { key: "booked", label: "Записались на собеседование", count: booked },
    { key: "accepted", label: "Прошли отбор", count: accepted },
  ];
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD по Москве
  registered: number;
  submitted: number;
}

/** Входы новых кандидатов и отправленные анкеты по дням за последние N дней. */
export async function daily(seasonId: string, days = 30, now = new Date()): Promise<DailyPoint[]> {
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [registered, submitted] = await Promise.all([
    db.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day, count(*) AS n
      FROM users u
      WHERE u."createdAt" >= ${from} AND u."isOwner" = false
        AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r."userId" = u.id)
      GROUP BY 1`,
    db.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT to_char(("submittedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day, count(*) AS n
      FROM applications
      WHERE "seasonId" = ${seasonId} AND status = 'SUBMITTED' AND "submittedAt" >= ${from}
      GROUP BY 1`,
  ]);

  const reg = new Map(registered.map((row) => [row.day, Number(row.n)]));
  const sub = new Map(submitted.map((row) => [row.day, Number(row.n)]));

  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(
      new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
    );
    points.push({ day, registered: reg.get(day) ?? 0, submitted: sub.get(day) ?? 0 });
  }
  return points;
}

export interface ReviewerStats {
  id: string;
  name: string;
  avatar: string | null;
  assigned: number;
  done: number;
  /** Средний итог по полностью проверенным; null — проверенных нет. */
  average: number | null;
}

export interface StageStats {
  max: number;
  reviewers: ReviewerStats[];
  /** Сколько проверенных работ набрали каждый итог: index = балл. */
  histogram: number[];
  overall: number | null;
}

export async function stageStats(seasonId: string, stage: Evaluated): Promise<StageStats> {
  const [criteria, reviews] = await Promise.all([
    db.criterion.findMany({ where: { seasonId, stageKind: stage }, select: { id: true, maxScore: true } }),
    db.review.findMany({
      where: { stageKind: stage, application: { seasonId, status: "SUBMITTED" } },
      select: {
        reviewerId: true,
        reviewer: { select: { firstName: true, lastName: true, telegramUsername: true, email: true, avatarKey: true } },
        scores: { select: { criterionId: true, score: true } },
      },
    }),
  ]);

  const max = criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  const histogram = Array.from({ length: max + 1 }, () => 0);
  const byReviewer = new Map<string, ReviewerStats & { totals: number[] }>();

  for (const review of reviews) {
    const summary = reviewSummary(criteria, review.scores);
    const row =
      byReviewer.get(review.reviewerId) ??
      {
        id: review.reviewerId,
        name: displayName(review.reviewer),
        avatar: review.reviewer.avatarKey ? `/api/avatars/${review.reviewer.avatarKey}` : null,
        assigned: 0, done: 0, average: null, totals: [] };
    row.assigned++;
    if (summary.status === "done" && summary.total !== null) {
      row.done++;
      row.totals.push(summary.total);
      histogram[summary.total] = (histogram[summary.total] ?? 0) + 1;
    }
    byReviewer.set(review.reviewerId, row);
  }

  const mean = (values: number[]) =>
    values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
  const all = [...byReviewer.values()].flatMap((row) => row.totals);

  return {
    max,
    histogram,
    overall: mean(all),
    reviewers: [...byReviewer.values()]
      .map(({ totals, ...row }) => ({ ...row, average: mean(totals) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
}

export interface Breakdown {
  question: string;
  rows: { label: string; count: number }[];
}

/** Разрезы по вопросам с выбором (курс, форма обучения, откуда узнали) — по отправленным анкетам. */
export async function breakdowns(seasonId: string): Promise<Breakdown[]> {
  const questions = await db.formQuestion.findMany({
    where: { seasonId, stageKind: "APPLICATION", type: { in: ["SINGLE_CHOICE", "MULTI_CHOICE"] } },
    orderBy: { order: "asc" },
    select: {
      label: true,
      options: true,
      answers: { where: { application: { status: "SUBMITTED" } }, select: { value: true } },
    },
  });

  return questions.map((question) => {
    const counts = new Map(question.options.map((option) => [option, 0]));
    for (const answer of question.answers) {
      for (const value of Array.isArray(answer.value) ? answer.value : [answer.value]) {
        if (typeof value === "string" && counts.has(value)) counts.set(value, counts.get(value)! + 1);
      }
    }
    return { question: question.label, rows: [...counts.entries()].map(([label, count]) => ({ label, count })) };
  });
}

export interface ChannelStats {
  candidates: number;
  telegram: number;
  push: number;
  deliveries: { channel: "TELEGRAM" | "PUSH"; sent: number; skipped: number; failed: number; pending: number }[];
}

export async function channels(): Promise<ChannelStats> {
  const candidate = { isOwner: false, roles: { none: {} } };
  const [candidates, telegram, pushUsers, grouped] = await Promise.all([
    db.user.count({ where: candidate }),
    db.user.count({ where: { ...candidate, telegramId: { not: null } } }),
    db.pushSubscription.groupBy({ by: ["userId"], where: { user: candidate } }),
    db.notificationDelivery.groupBy({ by: ["channel", "status"], _count: { _all: true } }),
  ]);

  const deliveries = (["TELEGRAM", "PUSH"] as const).map((channel) => {
    const of = (status: string) => grouped.find((row) => row.channel === channel && row.status === status)?._count._all ?? 0;
    return { channel, sent: of("SENT"), skipped: of("SKIPPED"), failed: of("FAILED"), pending: of("PENDING") };
  });

  return { candidates, telegram, push: pushUsers.length, deliveries };
}
