import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { assessmentReport, breakdowns, daily, funnel, interviewsReport, stageStats } from "./dashboards";

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
    expect(stats.reviewers).toEqual([{ id: katya.id, name: "Катя", avatar: null, assigned: 3, done: 2, average: 3 }]);
    expect(stats.histogram).toEqual([0, 0, 1, 0, 1]);
    expect(stats.overall).toBe(3);
  });

  it("ЦО: пришли, прогуляли и ещё впереди; конверсия — от пришедших", async () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const past = await db.assessmentSession.create({ data: { seasonId, title: "Прошлый", startsAt: new Date("2026-10-20T07:00:00Z") } });
    const future = await db.assessmentSession.create({ data: { seasonId, title: "Будущий", startsAt: new Date("2026-11-10T07:00:00Z") } });
    await db.assessmentSession.create({ data: { seasonId, title: "Резерв", startsAt: new Date("2026-10-25T07:00:00Z"), reserve: true } });
    const interviewer = await db.user.create({ data: {} });
    const criterion = await db.criterion.create({ data: { seasonId, stageKind: "INTERVIEW", order: 1, title: "Собес", maxScore: 4, levels: [] } });

    const create = async (
      name: string,
      faculty: string | null,
      invite: { sessionId: string; answer: "GOING" | "RESERVE" | "CANT"; attended?: boolean },
    ) => {
      const user = await db.user.create({ data: { firstName: name, faculty } });
      const application = await db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED" } });
      await db.assessmentInvite.create({ data: { applicationId: application.id, ...invite } });
      return application;
    };

    const attended = await create("Пришёл", "МЭО", { sessionId: past.id, answer: "GOING", attended: true });
    await create("Прогул", "МЭО", { sessionId: past.id, answer: "GOING" });
    await create("Впереди", "МЭО", { sessionId: future.id, answer: "GOING" });
    await create("Резерв", "ЮФ", { sessionId: past.id, answer: "RESERVE", attended: true });
    await create("Не смог", "МЭО", { sessionId: past.id, answer: "CANT" });

    const slot = await db.interviewSlot.create({
      data: { seasonId, startsAt: new Date("2026-10-22T08:00:00Z"), endsAt: new Date("2026-10-22T08:30:00Z"), location: "2" },
    });
    await db.interviewBooking.create({ data: { slotId: slot.id, applicationId: attended.id } });
    const review = await db.review.create({ data: { applicationId: attended.id, stageKind: "INTERVIEW", reviewerId: interviewer.id } });
    await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: 4 } });
    await db.stageDecision.create({
      data: { applicationId: attended.id, stageKind: "INTERVIEW", outcome: "PASSED", publishedAt: new Date() },
    });

    const report = await assessmentReport(seasonId, {}, now);
    const day = (key: string) => report.days.find((point) => point.day === key);
    expect(day("2026-10-20")).toMatchObject({ attended: 1, missed: 1, pending: 0 });
    expect(day("2026-10-25")).toMatchObject({ attended: 1, missed: 0, pending: 0 });
    expect(day("2026-11-10")).toMatchObject({ attended: 0, missed: 0, pending: 1 });
    expect(report.conversion.map((step) => step.count)).toEqual([2, 1, 1, 1]);

    const filtered = await assessmentReport(seasonId, { faculty: "МЭО", assessmentDay: "2026-10-20" }, now);
    expect(filtered.days).toHaveLength(1);
    expect(filtered.conversion.map((step) => step.count)).toEqual([1, 1, 1, 1]);
  });

  it("собеседования: записи и оценки по дням, с фильтром по факультету", async () => {
    const interviewer = await db.user.create({ data: {} });
    const criterion = await db.criterion.create({ data: { seasonId, stageKind: "INTERVIEW", order: 1, title: "Собес", maxScore: 4, levels: [] } });
    const slot = await db.interviewSlot.create({
      data: { seasonId, startsAt: new Date("2026-10-22T08:00:00Z"), endsAt: new Date("2026-10-22T08:30:00Z"), location: "2" },
    });

    const book = async (faculty: string, scored: boolean) => {
      const user = await db.user.create({ data: { faculty } });
      const application = await db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED" } });
      await db.interviewBooking.create({ data: { slotId: slot.id, applicationId: application.id } });
      if (scored) {
        const review = await db.review.create({ data: { applicationId: application.id, stageKind: "INTERVIEW", reviewerId: interviewer.id } });
        await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: 4 } });
      }
      return application;
    };

    await book("МЭО", true);
    await book("МЭО", false);
    await book("ЮФ", false);

    const all = await interviewsReport(seasonId);
    expect(all.days).toEqual([{ day: "2026-10-22", slots: 1, booked: 3, scored: 1 }]);

    const meo = await interviewsReport(seasonId, { faculty: "МЭО" });
    expect(meo.days).toEqual([{ day: "2026-10-22", slots: 1, booked: 2, scored: 1 }]);
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
