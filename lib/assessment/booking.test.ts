import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { bookAssessment, cancelAssessment, loadCandidateAssessment } from "./candidate";
import { distribute, saveGroup, setExperts } from "./groups";

describe("самозапись на центр оценки", () => {
  const NOW = new Date("2026-10-20T09:00:00Z");
  let seasonId: string;
  let roleId: string;

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    await db.stage.create({ data: { seasonId, kind: "ASSESSMENT", title: "Центр оценки", order: 3, mode: "OPEN" } });
    roleId = (await db.role.create({ data: { name: "Мастер", slug: "master", permissions: ["applications.review"] } })).id;
  });

  async function candidate(name: string, faculty: string | null) {
    const user = await db.user.create({ data: { firstName: name, faculty } });
    await db.application.create({ data: { seasonId, userId: user.id, firstName: name, status: "SUBMITTED", submittedAt: NOW } });
    return user;
  }
  async function group(title: string, startsAt: string, capacity: number | null, faculties: string[] = []) {
    const result = await saveGroup(seasonId, { title, building: "2", room: "305", startsAt, note: "", capacity, faculties });
    if (!result.ok) throw new Error(result.message);
    return result.id;
  }

  it("кандидат видит только даты своего факультета и с местами", async () => {
    const meo = await candidate("Мэошник", "МЭО");
    await group("МЭО и ЮФ", "2026-10-22T12:00:00Z", 10, ["МЭО", "ЮФ"]);
    await group("Только ФФ", "2026-10-22T15:00:00Z", 10, ["ФФ"]);
    await group("Все", "2026-10-23T12:00:00Z", 10);
    await group("Организаторы", "2026-10-23T15:00:00Z", null);

    const view = await loadCandidateAssessment(meo.id, NOW);
    expect(view?.options.map((option) => option.free)).toEqual([10, 10]);
    expect(view?.place).toBeNull();
  });

  it("запись: место сразу видно, эксперту — заготовка; последнее место — одному", async () => {
    const kate = await db.user.create({ data: { firstName: "Катя", roles: { create: { roleId } } } });
    const g = await group("Группа", "2026-10-22T12:00:00Z", 1);
    await setExperts(seasonId, g, [kate.id], kate.id);
    const a = await candidate("А", "МЭО");
    const b = await candidate("Б", "ЮФ");

    expect(await bookAssessment(a.id, g, NOW)).toMatchObject({ ok: true });
    const view = await loadCandidateAssessment(a.id, NOW);
    expect(view).toMatchObject({ selfBooked: true, canChange: true, place: { building: "2", room: "305" } });
    expect(await db.review.count({ where: { stageKind: "ASSESSMENT", reviewerId: kate.id } })).toBe(1);

    expect(await bookAssessment(b.id, g, NOW)).toMatchObject({ ok: false, message: expect.stringContaining("места закончились") });
  });

  it("чужой факультет, перенос за 12 часов и группа организаторов — нельзя; отмена освобождает место", async () => {
    const onlyFf = await group("ФФ", "2026-10-22T12:00:00Z", 5, ["ФФ"]);
    const soon = await group("Скоро", "2026-10-20T18:00:00Z", 5);
    const later = await group("Позже", "2026-10-24T12:00:00Z", 5);
    const a = await candidate("А", "МЭО");

    expect(await bookAssessment(a.id, onlyFf, NOW)).toMatchObject({ ok: false });
    expect(await bookAssessment(a.id, soon, NOW)).toMatchObject({ ok: true });
    expect(await bookAssessment(a.id, later, NOW)).toMatchObject({ ok: false, message: expect.stringContaining("12 часов") });
    expect(await cancelAssessment(a.id, NOW)).toMatchObject({ ok: false });

    const b = await candidate("Б", "МЭО");
    expect(await bookAssessment(b.id, later, NOW)).toMatchObject({ ok: true });
    expect(await cancelAssessment(b.id, NOW)).toMatchObject({ ok: true });
    expect(await db.assessmentMember.count({ where: { groupId: later } })).toBe(0);

    // Группу без самозаписи собирают организаторы — оттуда сам не уйдёшь.
    await group("Сборная", "2026-10-25T12:00:00Z", null);
    expect(await distribute(seasonId, b.id)).toMatchObject({ ok: true, placed: 1 });
    expect(await bookAssessment(b.id, later, NOW)).toMatchObject({ ok: false, message: expect.stringContaining("организаторы") });
  });
});
