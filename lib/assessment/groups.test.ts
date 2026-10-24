import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteGroup, distribute, loadGroups, notifyGroup, placeMember, saveGroup, setExperts } from "./groups";

describe("группы центра оценки", () => {
  let seasonId: string;
  let roleId: string;
  let criterionId: string;

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    roleId = (await db.role.create({ data: { name: "Мастер", slug: "master", permissions: ["applications.review"] } })).id;
    criterionId = (
      await db.criterion.create({ data: { seasonId, stageKind: "ASSESSMENT", order: 1, title: "Командность", maxScore: 2, levels: [] } })
    ).id;
  });

  const expert = (name: string) => db.user.create({ data: { firstName: name, roles: { create: { roleId } } } });
  async function candidate(name: string) {
    const user = await db.user.create({ data: { firstName: name } });
    return db.application.create({ data: { seasonId, userId: user.id, firstName: name, status: "SUBMITTED", submittedAt: new Date() } });
  }
  async function group(title: string, extra: Partial<{ building: string; room: string; startsAt: string }> = {}) {
    const result = await saveGroup(seasonId, { title, building: "", room: "", startsAt: null, note: "", ...extra });
    if (!result.ok) throw new Error(result.message);
    return result.id;
  }

  it("раскладывает поровну и создаёт заготовки оценок экспертам", async () => {
    const [g1, g2] = [await group("Группа 1"), await group("Группа 2")];
    const kate = await expert("Катя");
    await setExperts(seasonId, g1, [kate.id], kate.id);
    for (const name of ["А", "Б", "В"]) await candidate(name);

    const result = await distribute(seasonId, kate.id);
    expect(result).toMatchObject({ ok: true, placed: 3 });

    const { groups, free } = await loadGroups(seasonId);
    expect(free).toHaveLength(0);
    expect(groups.map((row) => row.members.length).sort()).toEqual([1, 2]);
    // Заготовки — только у кандидатов группы с экспертом.
    const size = groups.find((row) => row.id === g1)!.members.length;
    expect(await db.review.count({ where: { stageKind: "ASSESSMENT", reviewerId: kate.id } })).toBe(size);
    expect(g2).toBeTruthy();
  });

  it("эксперта с начатой оценкой снять нельзя, без оценок — можно", async () => {
    const g = await group("Группа");
    const kate = await expert("Катя");
    const ilya = await expert("Илья");
    const a = await candidate("А");
    await placeMember(seasonId, a.id, g, kate.id);
    await setExperts(seasonId, g, [kate.id, ilya.id], kate.id);

    const review = await db.review.findFirstOrThrow({ where: { reviewerId: kate.id, stageKind: "ASSESSMENT" } });
    await db.reviewScore.create({ data: { reviewId: review.id, criterionId, score: 2 } });

    expect(await setExperts(seasonId, g, [ilya.id], kate.id)).toMatchObject({ ok: false });
    expect(await setExperts(seasonId, g, [kate.id], kate.id)).toMatchObject({ ok: true, removed: [ilya.id] });
    expect(await db.review.count({ where: { reviewerId: ilya.id } })).toBe(0);
  });

  it("перенос: пустые заготовки уходят, начатые остаются", async () => {
    const [g1, g2] = [await group("1"), await group("2")];
    const [kate, ilya, olya] = [await expert("Катя"), await expert("Илья"), await expert("Оля")];
    await setExperts(seasonId, g1, [kate.id, ilya.id], kate.id);
    await setExperts(seasonId, g2, [olya.id], kate.id);
    const a = await candidate("А");
    await placeMember(seasonId, a.id, g1, kate.id);

    const started = await db.review.findFirstOrThrow({ where: { reviewerId: kate.id } });
    await db.review.update({ where: { id: started.id }, data: { comment: "Хорош в команде" } });

    const moved = await placeMember(seasonId, a.id, g2, kate.id);
    expect(moved).toMatchObject({ ok: true, from: "1", to: "2", kept: 1 });
    const reviewers = (await db.review.findMany({ where: { applicationId: a.id }, select: { reviewerId: true } })).map((r) => r.reviewerId);
    expect(reviewers.sort()).toEqual([kate.id, olya.id].sort());
  });

  it("группу удалить можно и с кандидатами: они — без группы, начатые оценки остаются", async () => {
    const g = await group("Группа");
    const kate = await expert("Катя");
    await setExperts(seasonId, g, [kate.id], kate.id);
    const a = await candidate("А");
    const b = await candidate("Б");
    await placeMember(seasonId, a.id, g, kate.id);
    await placeMember(seasonId, b.id, g, kate.id);
    const started = await db.review.findFirstOrThrow({ where: { applicationId: a.id, reviewerId: kate.id } });
    await db.review.update({ where: { id: started.id }, data: { comment: "Хорош в команде" } });

    expect(await deleteGroup(seasonId, g)).toMatchObject({ ok: true, title: "Группа", members: 2, kept: 1, notified: false });
    expect(await db.assessmentGroup.count()).toBe(0);
    expect(await db.assessmentMember.count()).toBe(0);
    // Пустая заготовка Б убрана, начатая оценка А — на месте.
    expect((await db.review.findMany({ where: { stageKind: "ASSESSMENT" }, select: { applicationId: true } })).map((r) => r.applicationId)).toEqual([a.id]);
    expect((await loadGroups(seasonId)).free).toHaveLength(2);
  });

  it("рассылка: нужно место и время; повтор — только после изменения", async () => {
    const g = await group("Группа", { building: "2", room: "305", startsAt: "2026-10-15T15:00:00.000Z" });
    const a = await candidate("А");
    await placeMember(seasonId, a.id, g, null);

    expect(await notifyGroup(seasonId, g)).toMatchObject({ ok: true, sent: 1, repeat: false });
    expect(await notifyGroup(seasonId, g)).toMatchObject({ ok: false });

    await saveGroup(seasonId, { id: g, title: "Группа", building: "2", room: "306", startsAt: "2026-10-15T15:00:00.000Z", note: "" });
    expect((await loadGroups(seasonId)).groups[0]!.stale).toBe(true);
    expect(await notifyGroup(seasonId, g)).toMatchObject({ ok: true, repeat: true });

    const notes = await db.notification.findMany({ where: { userId: a.userId }, orderBy: { createdAt: "asc" } });
    expect(notes).toHaveLength(2);
    expect(notes[0]!.body).toContain("Корпус 2, аудитория 305");
    expect(notes[0]!.body).toContain("15 октября");
    expect(notes[0]!.body).toContain("18:00");
  });

  it("без места сообщать нельзя", async () => {
    const g = await group("Группа");
    const a = await candidate("А");
    await placeMember(seasonId, a.id, g, null);
    expect(await notifyGroup(seasonId, g)).toMatchObject({ ok: false });
  });
});
