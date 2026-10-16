import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { breakdowns, daily, funnel, stageStats } from "./dashboards";

let seasonId: string;
beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
});

describe("дашборды", () => {
  it("воронка считает каждый шаг", async () => {
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: [] } });
    await db.user.create({ data: { roles: { create: { roleId: role.id } } } }); // организатор — не в воронке
    await db.user.create({ data: {} }); // только вошёл
    const draft = await db.user.create({ data: {} });
    await db.application.create({ data: { seasonId, userId: draft.id } });
    const sent = await db.user.create({ data: {} });
    const application = await db.application.create({ data: { seasonId, userId: sent.id, status: "SUBMITTED" } });
    await db.stageDecision.create({ data: { applicationId: application.id, stageKind: "INTERVIEW", outcome: "PASSED", publishedAt: new Date() } });

    const steps = Object.fromEntries((await funnel(seasonId)).map((step) => [step.key, step.count]));
    expect(steps).toMatchObject({ registered: 3, started: 2, submitted: 1, homework: 0, assessment: 0, accepted: 1 });
  });

  it("дни — по Москве: 23:30 UTC — это уже следующий московский день", async () => {
    const now = new Date("2026-10-10T12:00:00Z");
    await db.user.create({ data: { createdAt: new Date("2026-10-08T23:30:00Z") } });
    const points = await daily(seasonId, 5, now);
    expect(points.find((point) => point.day === "2026-10-09")?.registered).toBe(1);
    expect(points.find((point) => point.day === "2026-10-08")?.registered).toBe(0);
    expect(points).toHaveLength(5);
  });

  it("статистика мастеров: назначено, проверено, средний, гистограмма", async () => {
    const criterion = await db.criterion.create({ data: { seasonId, stageKind: "APPLICATION", order: 1, title: "И", maxScore: 4, levels: [] } });
    const katya = await db.user.create({ data: { firstName: "Катя" } });
    for (const score of [4, 2, null]) {
      const user = await db.user.create({ data: {} });
      const application = await db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED" } });
      const review = await db.review.create({ data: { applicationId: application.id, stageKind: "APPLICATION", reviewerId: katya.id } });
      if (score !== null) await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score } });
    }

    const stats = await stageStats(seasonId, "APPLICATION");
    expect(stats.reviewers).toEqual([{ id: katya.id, name: "Катя", assigned: 3, done: 2, average: 3 }]);
    expect(stats.histogram).toEqual([0, 0, 1, 0, 1]);
    expect(stats.overall).toBe(3);
  });

  it("разрезы по вопросам с выбором — только отправленные анкеты", async () => {
    const question = await db.formQuestion.create({
      data: { seasonId, stageKind: "APPLICATION", order: 1, section: "О себе", type: "SINGLE_CHOICE", label: "Курс", options: ["1 курс", "2 курс"] },
    });
    for (const [status, value] of [["SUBMITTED", "1 курс"], ["SUBMITTED", "1 курс"], ["DRAFT", "2 курс"]] as const) {
      const user = await db.user.create({ data: {} });
      const application = await db.application.create({ data: { seasonId, userId: user.id, status } });
      await db.answer.create({ data: { applicationId: application.id, questionId: question.id, value } });
    }

    expect(await breakdowns(seasonId)).toEqual([
      { question: "Курс", rows: [{ label: "1 курс", count: 2 }, { label: "2 курс", count: 0 }] },
    ]);
  });
});
