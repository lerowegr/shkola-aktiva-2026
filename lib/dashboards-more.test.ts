import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import {
  deliveries,
  engagement,
  masterInterviewsByDay,
  milestonesByDay,
  staffMasters,
  finalScores,
  freeSeats,
  facultyOutcomes,
  funnel,
  messageBacklog,
  notBooked,
  reviewerAgreement,
  scoreGaps,
  speed,
  todayBoard,
} from "./dashboards";

/**
 * Оперативные и итоговые отчёты. Фикстура: два кандидата с оценками,
 * слоты на «сегодня», запись, перенесённая запись, переписка без ответа,
 * уведомление, игра и тест.
 */
let seasonId: string;
// Полдень по Москве: день «сегодня» известен заранее.
const now = new Date("2026-11-04T09:00:00Z"); // 12:00 МСК

beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
});

async function candidate(options: { faculty?: string; course?: string; submitted?: boolean } = {}) {
  const user = await db.user.create({
    data: { faculty: options.faculty, course: options.course, lastName: "Кандидатов", firstName: `Номер${user_name_seed()}` },
  });
  const application = await db.application.create({
    data: {
      seasonId,
      userId: user.id,
      status: options.submitted === false ? "DRAFT" : "SUBMITTED",
      lastName: "Кандидатова",
      firstName: `Номер${user.id.slice(-3)}`,
      submittedAt: options.submitted === false ? undefined : new Date(now.getTime() - 48 * 3600 * 1000),
    },
  });
  return { user, application };
}

let nameSeed = 0;
const user_name_seed = () => ++nameSeed;

async function scoredReview(applicationId: string, stage: "APPLICATION" | "INTERVIEW", reviewerId: string, score: number, savedAt = now) {
  // Один критерий на этап сезона: оценка обязана закрывать все критерии этапа.
  const criterion =
    (await db.criterion.findFirst({ where: { seasonId, stageKind: stage } })) ??
    (await db.criterion.create({
      data: { seasonId, stageKind: stage, order: 1, title: `Критерий ${stage}`, maxScore: 4, levels: [] },
    }));
  const review = await db.review.create({
    data: { applicationId, stageKind: stage, reviewerId, assignedAt: savedAt },
  });
  await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score } });
  // updatedAt ставится автоматически; для теста скорости подменяем вручную.
  await db.review.update({ where: { id: review.id }, data: { updatedAt: savedAt } });
  return criterion;
}

async function slotAt(dayOffsetHours: number, location = "Главный корпус") {
  const master = await db.user.create({ data: { firstName: "Мастер" } });
  const startsAt = new Date(now.getTime() + dayOffsetHours * 3600 * 1000);
  return db.interviewSlot.create({
    data: {
      seasonId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60 * 1000),
      location,
      interviewers: { create: { userId: master.id } },
    },
  });
}

describe("оперативные отчёты", () => {
  it("«Сейчас»: слоты по корпусам, встречи, переносы и переписка", async () => {
    const { application } = await candidate({ faculty: "МЭО" });
    const first = await slotAt(2);
    await slotAt(4, "Второй корпус");
    await db.interviewBooking.create({ data: { slotId: first.id, applicationId: application.id } });

    // Перенос за «сегодня»: запись отменена 40 минут назад.
    const old = await slotAt(-48);
    await db.interviewBooking.create({
      data: { slotId: old.id, applicationId: application.id, cancelledAt: new Date(now.getTime() - 40 * 60 * 1000) },
    });

    // Переписка: кандидат написал 8 часов назад, организаторы молчат.
    const thread = await db.messageThread.create({
      data: { seasonId, candidateId: application.userId, lastMessageAt: new Date(now.getTime() - 8 * 3600 * 1000) },
    });
    await db.message.create({
      data: { threadId: thread.id, author: "CANDIDATE", text: "Когда собеседование?", createdAt: new Date(now.getTime() - 8 * 3600 * 1000) },
    });

    const board = await todayBoard(seasonId, {}, now);
    expect(board.day).toBe("2026-11-04");
    expect(board.places).toHaveLength(2);
    expect(board.upcoming).toHaveLength(1);
    expect(board.upcoming[0]).toMatchObject({ started: false, location: "Главный корпус" });
    expect(board.reschedules).toBe(1);
    expect(board.waiting).toBe(1);

    const backlog = await messageBacklog(seasonId, {}, now);
    expect(backlog.open).toBe(1);
    expect(backlog.rows[0]!.name).toContain("Кандидатов");
    expect(backlog.rows[0]!.lastByStaff).toBeNull();
    expect(backlog.buckets.find((bucket) => bucket.label.startsWith("От 6"))?.count).toBe(1);
  });

  it("свободные места: занятость по дням и кто не записался", async () => {
    const { application } = await candidate({ faculty: "ЮФ" });
    const session = await db.assessmentSession.create({ data: { seasonId, title: "ЦО", startsAt: new Date("2026-11-01T10:00:00Z") } });
    await db.assessmentInvite.create({ data: { applicationId: application.id, sessionId: session.id, attended: true } });
    const booked = await slotAt(30);
    await db.interviewBooking.create({ data: { slotId: booked.id, applicationId: application.id } });
    const { application: shy } = await candidate({ faculty: "ЮФ" });
    await db.assessmentInvite.create({
      data: { applicationId: shy.id, sessionId: session.id, attended: true },
    });
    await candidate({ faculty: "МЭО" }); // отправил, но на ЦО не отвечал

    const report = await freeSeats(seasonId, { faculty: "ЮФ" }, now);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ slots: 1, booked: 1 });
    expect(report.notBooked).toBe(1); // shy: был на ЦО, не записался
    expect(report.eligibleNotBooked).toBe(1);
  });

  it("не записавшиеся: совпадает с сегментами рассылок", async () => {
    const silent = await candidate({});
    const attended = await candidate({});
    const session = await db.assessmentSession.create({ data: { seasonId, title: "ЦО", startsAt: new Date("2026-11-01T10:00:00Z") } });
    await db.assessmentInvite.create({ data: { applicationId: attended.application.id, sessionId: session.id, attended: true, answer: "GOING" } });
    await slotAt(30);

    const report = await notBooked(seasonId, {}, now);
    expect(report.assessment.count).toBe(1); // silent: не ответил на приглашение
    expect(report.assessment.rows[0]!.id).toBe(silent.application.id);
    expect(report.interview.count).toBe(1);
    expect(report.interview.rows[0]!.id).toBe(attended.application.id);
    expect(report.interview.rows[0]!.daysLeft).toBe(1); // слот завтра
  });
});

describe("качество оценок", () => {
  it("согласованность: средний мастера против общего по критерию", async () => {
    const katya = await db.user.create({ data: { firstName: "Катя" } });
    const ilya = await db.user.create({ data: { firstName: "Илья" } });
    const first = await candidate({});
    const second = await candidate({});
    // Катя ставит 4 и 4, Илья — 0: общий средний 8/3 ≈ 2.7.
    const criterion = await db.criterion.create({
      data: { seasonId, stageKind: "APPLICATION", order: 1, title: "Критерий", maxScore: 4, levels: [] },
    });
    const addScore = async (applicationId: string, reviewerId: string, score: number) => {
      const review = await db.review.create({ data: { applicationId, stageKind: "APPLICATION", reviewerId } });
      await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score } });
    };
    await addScore(first.application.id, katya.id, 4);
    await addScore(second.application.id, katya.id, 4);
    await addScore(first.application.id, ilya.id, 0);

    const report = await reviewerAgreement(seasonId);
    const row = report.APPLICATION[0]!;
    expect(row.overall).toBe(2.7);
    const katyaRow = row.reviewers.find((item) => item.name === "Катя")!;
    expect(katyaRow).toMatchObject({ mean: 4, n: 2 });
    const ilyaRow = row.reviewers.find((item) => item.name === "Илья")!;
    expect(ilyaRow).toMatchObject({ mean: 0, n: 1 });
  });

  it("скорость: медиана минут до первой оценки", async () => {
    const master = await db.user.create({ data: { firstName: "Мастер" } });
    const { application } = await candidate({});
    await scoredReview(application.id, "APPLICATION", master.id, 3, new Date(now.getTime() - 47 * 3600 * 1000));

    const report = await speed(seasonId);
    const anketa = report.stages.find((stage) => stage.stage === "APPLICATION")!;
    expect(anketa.samples).toBe(1);
    expect(anketa.medianMinutes).toBe(60); // 48 ч − 47 ч
  });

  it("разрывы: сортировка по модулю разницы анкеты и собеса", async () => {
    const master = await db.user.create({ data: { firstName: "Мастер" } });
    const big = await candidate({});
    const small = await candidate({});
    await scoredReview(big.application.id, "APPLICATION", master.id, 4);
    await scoredReview(big.application.id, "INTERVIEW", master.id, 0);
    await scoredReview(small.application.id, "APPLICATION", master.id, 4);
    await scoredReview(small.application.id, "INTERVIEW", master.id, 4);

    const report = await scoreGaps(seasonId);
    expect(report.rows[0]!.gap).toBe(-100);
    expect(report.rows[0]!.id).toBe(big.application.id);
    expect(report.rows[1]!.gap).toBe(0);
  });
});

describe("итоги", () => {
  it("итоговые баллы: гистограмма, средние по этапам, разрез по факультетам", async () => {
    const master = await db.user.create({ data: { firstName: "Мастер" } });
    const first = await candidate({ faculty: "МЭО" });
    const second = await candidate({ faculty: "ЮФ" });
    await scoredReview(first.application.id, "APPLICATION", master.id, 4);
    await scoredReview(first.application.id, "INTERVIEW", master.id, 4);
    await scoredReview(second.application.id, "APPLICATION", master.id, 2);
    await scoredReview(second.application.id, "INTERVIEW", master.id, 2);
    await db.stageDecision.create({
      data: { applicationId: first.application.id, stageKind: "INTERVIEW", outcome: "PASSED", publishedAt: now },
    });

    const report = await finalScores(seasonId);
    expect(report.count).toBe(2);
    expect(report.maxTotal).toBe(8);
    expect(report.histogram[8]).toBe(1); // первый: 4 + 4
    expect(report.histogram[4]).toBe(1); // второй: 2 + 2
    expect(report.stageMeans.map((part) => part.mean)).toEqual([3, 3]);
    expect(report.accepted).toBe(1);

    const faculties = await facultyOutcomes(seasonId);
    const meo = faculties.find((row) => row.faculty === "МЭО")!;
    expect(meo).toMatchObject({ submitted: 1, accepted: 1, meanFinal: 8 });
  });

  it("воронка со срезом по факультету и по ответу «откуда узнал»", async () => {
    const question = await db.formQuestion.create({
      data: { seasonId, stageKind: "APPLICATION", order: 1, label: "Как ты узнал(-а) об отборе?", type: "SINGLE_CHOICE", options: ["ВК", "Друзья"], section: "Контакты" },
    });
    const vk = await candidate({ faculty: "МЭО" });
    const friends = await candidate({ faculty: "ЮФ" });
    await db.answer.create({ data: { applicationId: vk.application.id, questionId: question.id, value: "ВК" } });
    await db.answer.create({ data: { applicationId: friends.application.id, questionId: question.id, value: "Друзья" } });

    const all = Object.fromEntries((await funnel(seasonId)).map((step) => [step.key, step.count]));
    expect(all.submitted).toBe(2);
    const sliced = Object.fromEntries((await funnel(seasonId, { source: "ВК" })).map((step) => [step.key, step.count]));
    expect(sliced.submitted).toBe(1);
    const byFaculty = Object.fromEntries((await funnel(seasonId, { faculty: "ЮФ" })).map((step) => [step.key, step.count]));
    expect(byFaculty.started).toBe(1);
  });
});

describe("каналы и вовлечённость", () => {
  it("уведомления по дням и вовлечённость по этапам", async () => {
    const player = await candidate({});
    const quiet = await candidate({});
    await db.gameResult.create({
      data: { userId: player.user.id, game: "MEMORY", score: 8, moves: 8, durationMs: 30000, createdAt: now },
    });
    await db.quizAttempt.create({
      data: { seasonId, userId: player.user.id, score: 9, total: 10, durationMs: 60000, answers: [] },
    });
    await db.notification.create({ data: { userId: quiet.user.id, category: "SELECTION", title: "Проверка", key: "k1", createdAt: now } });
    await db.notificationDelivery.create({
      data: { notificationId: (await db.notification.findFirstOrThrow()).id, userId: quiet.user.id, channel: "TELEGRAM", status: "SENT", scheduledAt: now, createdAt: now },
    });

    const report = await deliveries(seasonId, 14, now);
    expect(report.days.at(-1)).toMatchObject({ sent: 1, failed: 0 });
    expect(report.categories[0]).toMatchObject({ category: "SELECTION", created: 1, sent: 1 });

    const activity = await engagement(seasonId, now);
    expect(activity.quiz).toMatchObject({ takers: 1, meanPercent: 90 });
    expect(activity.byStage.find((row) => row.key === "submitted")).toMatchObject({ total: 2, players: 1 });
  });
});

describe("прохождение по дням и мастера", () => {
  it("этапы по дням: анкета, ЦО, собес, принятие; срезы факультета и корпуса", async () => {
    const master = await db.user.create({ data: { firstName: "Мастер" } });
    const { application, user } = await candidate({ faculty: "МЭО" });
    await db.user.update({ where: { id: user.id }, data: { faculty: "МЭО" } });

    // Анкета — вчера (по фиксированному now).
    await db.application.update({
      where: { id: application.id },
      data: { submittedAt: new Date(now.getTime() - 24 * 3600 * 1000) },
    });
    // Явка на ЦО — позавчера, основной сбор.
    const session = await db.assessmentSession.create({
      data: { seasonId, title: "ЦО", startsAt: new Date(now.getTime() - 48 * 3600 * 1000), building: "Главный" },
    });
    await db.assessmentInvite.create({
      data: { applicationId: application.id, sessionId: session.id, attended: true, answer: "GOING" },
    });
    // Собеседование — сегодня.
    const slot = await db.interviewSlot.create({
      data: {
        seasonId,
        startsAt: now,
        endsAt: new Date(now.getTime() + 45 * 60 * 1000),
        location: "Главный",
        interviewers: { create: { userId: master.id } },
      },
    });
    await db.interviewBooking.create({ data: { slotId: slot.id, applicationId: application.id } });
    // Принятие — сегодня.
    await db.stageDecision.create({
      data: { applicationId: application.id, stageKind: "INTERVIEW", outcome: "PASSED", publishedAt: now },
    });

    const report = await milestonesByDay(
      seasonId,
      {},
      new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      now,
    );
    const total = report.totals;
    expect(total).toMatchObject({ submitted: 1, assessment: 1, interviews: 1, accepted: 1 });
    const today = report.days.find((row) => row.day === "2026-11-04")!;
    expect(today).toMatchObject({ interviews: 1, accepted: 1 });
    expect(report.days.find((row) => row.day === "2026-11-02")).toMatchObject({ submitted: 0, assessment: 1 });
    const dayBefore = report.days.find((row) => row.day === "2026-11-03")!;
    expect(dayBefore.submitted).toBe(1);

    // Радуга факультетов и корпуса.
    const faculty = report.faculties.find((row) => row.faculty === "МЭО")!;
    expect(faculty).toMatchObject({ submitted: 1, assessment: 1, interviews: 1, accepted: 1 });
    const building = report.buildings.find((row) => row.building === "Главный")!;
    expect(building).toMatchObject({ assessment: 1, interviews: 1 });

    // Срез корпуса: второй корпус пуст.
    const other = await milestonesByDay(
      seasonId,
      { building: "Второй" },
      new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      now,
    );
    expect(other.totals).toMatchObject({ assessment: 0, interviews: 0 });

    // Срез факультета.
    const yuf = await milestonesByDay(
      seasonId,
      { faculty: "ЮФ" },
      new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      now,
    );
    expect(yuf.totals).toMatchObject({ submitted: 0 });

    // Мастер: слоты и записи по дням; список мастеров.
    const days = await masterInterviewsByDay(seasonId, master.id, new Date(now.getTime() - 3600 * 1000), now);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ slots: 1, booked: 1 });
    const masters = await staffMasters(seasonId);
    expect(masters.map((item) => item.name)).toContain("Мастер");
  });
});
