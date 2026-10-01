import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { saveScore, saveText } from "./review-store";
import { listApplications, loadStaffApplication } from "./staff";

let seasonId: string;
let katya: { id: string };
let ilya: { id: string };
let interest: { id: string };
let deadline: { id: string };
let motivation: { id: string };

beforeEach(async () => {
  await resetDatabase();
  const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
  seasonId = season.id;
  katya = await db.user.create({ data: { firstName: "Екатерина", lastName: "Орлова" } });
  ilya = await db.user.create({ data: { firstName: "Илья", lastName: "Воронов" } });
  interest = await db.criterion.create({
    data: { seasonId, stageKind: "APPLICATION", order: 1, title: "Заинтересованность", maxScore: 4, levels: [] },
  });
  deadline = await db.criterion.create({
    data: { seasonId, stageKind: "APPLICATION", order: 2, title: "Дедлайн", maxScore: 2, levels: [] },
  });
  motivation = await db.marker.create({
    data: { seasonId, stageKind: "APPLICATION", order: 1, title: "Мотивация" },
  });
});

async function application(lastName: string, reviewerId: string | null, opts: { username?: string; studentId?: string } = {}) {
  const user = await db.user.create({ data: { firstName: "Имя", telegramUsername: opts.username ?? null } });
  const app = await db.application.create({
    data: {
      seasonId,
      userId: user.id,
      status: "SUBMITTED",
      lastName,
      firstName: "Имя",
      studentId: opts.studentId ?? null,
      submittedAt: new Date(),
    },
  });
  const review = reviewerId
    ? await db.review.create({ data: { applicationId: app.id, stageKind: "APPLICATION", reviewerId } })
    : null;
  return { app, review };
}

describe("listApplications", () => {
  it("мои — только назначенные мне, все — все отправленные", async () => {
    await application("Смирнова", katya.id);
    await application("Белов", ilya.id);
    await application("Никому", null);

    const mine = await listApplications({ seasonId, viewerId: katya.id, scope: "mine", filter: "all", query: "" });
    const all = await listApplications({ seasonId, viewerId: katya.id, scope: "all", filter: "all", query: "" });

    expect(mine.rows.map((row) => row.name)).toEqual(["Смирнова Имя"]);
    expect(all.rows).toHaveLength(3);
    expect(all.unassigned).toBe(1);
  });

  it("черновики в списки не попадают", async () => {
    const user = await db.user.create({ data: {} });
    await db.application.create({ data: { seasonId, userId: user.id } });
    const all = await listApplications({ seasonId, viewerId: katya.id, scope: "all", filter: "all", query: "" });
    expect(all.rows).toHaveLength(0);
  });

  it("фильтр по проверке и счётчики", async () => {
    const { review } = await application("Смирнова", katya.id);
    await application("Ковалёв", katya.id);
    await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: interest.id, score: 3 });
    await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: deadline.id, score: 2 });

    const todo = await listApplications({ seasonId, viewerId: katya.id, scope: "mine", filter: "todo", query: "" });
    expect(todo.rows.map((row) => row.name)).toEqual(["Ковалёв Имя"]);
    expect(todo.counts).toEqual({ all: 2, todo: 1, done: 1 });
  });

  it("поиск по фамилии, нику и студбилету", async () => {
    await application("Смирнова", katya.id, { username: "alina_sm" });
    await application("Петрова", katya.id, { studentId: "20241037" });
    const find = async (query: string) =>
      (await listApplications({ seasonId, viewerId: katya.id, scope: "mine", filter: "all", query })).rows.map(
        (row) => row.name,
      );

    expect(await find("смирн")).toEqual(["Смирнова Имя"]);
    expect(await find("@alina")).toEqual(["Смирнова Имя"]);
    expect(await find("1037")).toEqual(["Петрова Имя"]);
  });

  it("чип маркера — только если мастер что-то написал", async () => {
    const { review } = await application("Смирнова", katya.id);
    await saveText({ reviewId: review!.id, actorId: katya.id, field: motivation.id, value: "Хочет найти друзей" });
    const list = await listApplications({ seasonId, viewerId: katya.id, scope: "mine", filter: "all", query: "" });
    expect(list.rows[0]!.markers).toEqual(["Мотивация"]);

    await saveText({ reviewId: review!.id, actorId: katya.id, field: motivation.id, value: "  " });
    const after = await listApplications({ seasonId, viewerId: katya.id, scope: "mine", filter: "all", query: "" });
    expect(after.rows[0]!.markers).toEqual([]);
  });
});

describe("сохранение оценки", () => {
  it("чужую оценку менять нельзя", async () => {
    const { review } = await application("Смирнова", katya.id);
    const result = await saveScore({ reviewId: review!.id, actorId: ilya.id, criterionId: interest.id, score: 2 });
    expect(result.ok).toBe(false);
  });

  it("балл вне шкалы не сохраняется, снятый балл удаляется", async () => {
    const { review } = await application("Смирнова", katya.id);
    expect((await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: deadline.id, score: 3 })).ok).toBe(false);

    await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: deadline.id, score: 1 });
    await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: deadline.id, score: null });
    expect(await db.reviewScore.count()).toBe(0);
  });

  it("каждый балл — в журнал, текст — не чаще раза в 5 минут на поле", async () => {
    const { review } = await application("Смирнова", katya.id);
    await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: interest.id, score: 1 });
    await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: interest.id, score: 2 });
    await saveText({ reviewId: review!.id, actorId: katya.id, field: "comment", value: "Н" });
    await saveText({ reviewId: review!.id, actorId: katya.id, field: "comment", value: "Нр" });
    await saveText({ reviewId: review!.id, actorId: katya.id, field: motivation.id, value: "Да" });

    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map((row) => row.action);
    expect(actions).toEqual(["review.score", "review.score", "review.text", "review.text"]);
  });

  it("карточка показывает, кто и когда менял оценку", async () => {
    const { app, review } = await application("Смирнова", katya.id);
    await saveScore({ reviewId: review!.id, actorId: katya.id, criterionId: interest.id, score: 4 });

    const card = await loadStaffApplication(app.id, ilya.id);
    expect(card?.reviews[0]).toMatchObject({ isMine: false, updatedBy: "Екатерина Орлова", touched: true });
    expect(card?.reviews[0]?.summary).toEqual({ total: 4, max: 6, status: "progress" });
  });
});
