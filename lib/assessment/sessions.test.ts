import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteSession, inviteSession, loadOverview, loadSessionPage, notifyChange, remindSession, saveSession } from "./sessions";

describe("сборы центра оценки", () => {
  let seasonId: string;

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  });

  async function candidate(faculty: string | null, status: "SUBMITTED" | "DRAFT" = "SUBMITTED") {
    const user = await db.user.create({ data: { firstName: faculty ?? "Без", faculty } });
    return db.application.create({ data: { seasonId, userId: user.id, firstName: faculty ?? "Без", status, submittedAt: new Date() } });
  }
  const base = { building: "2", room: "Лекционная 305", note: "", reserve: false };
  async function session(title: string, faculties: string[], extra: Partial<typeof base & { startsAt: string }> = {}) {
    const result = await saveSession(seasonId, { title, startsAt: "2026-11-02T15:00:00.000Z", faculties, ...base, ...extra });
    if (!result.ok) throw new Error(result.message);
    return result.id;
  }

  it("сбор без факультетов не создать, резервный день — один на сезон", async () => {
    expect(await saveSession(seasonId, { title: "Пн", startsAt: "2026-11-02T15:00:00.000Z", faculties: [], ...base })).toMatchObject({ ok: false });
    await session("Резерв", [], { reserve: true });
    expect(await saveSession(seasonId, { title: "Ещё", startsAt: "2026-11-02T15:00:00.000Z", faculties: [], ...base, reserve: true })).toMatchObject({
      ok: false,
    });
  });

  it("приглашает только свои факультеты и отправивших; повтор — 0; приглашённых на другой сбор пропускает", async () => {
    const snimk = await candidate("СНиМК");
    const meo = await candidate("МЭО");
    const law = await candidate("ЮФ");
    await candidate("МЭО", "DRAFT");
    const monday = await session("Пн: СНиМК и МЭО", ["СНиМК", "МЭО"]);

    expect(await inviteSession(seasonId, monday)).toMatchObject({ ok: true, invited: 2 });
    expect(await inviteSession(seasonId, monday)).toMatchObject({ ok: true, invited: 0 });
    const invited = (await db.assessmentInvite.findMany({ select: { applicationId: true } })).map((row) => row.applicationId).sort();
    expect(invited).toEqual([snimk.id, meo.id].sort());

    const notes = await db.notification.findMany({ where: { userId: snimk.userId } });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.url).toBe("/cabinet/assessment");
    expect(await db.notification.count({ where: { userId: law.userId } })).toBe(0);

    // На другой сбор уже приглашённых не зовём, даже явно.
    const tuesday = await session("Вт: все", ["СНиМК", "МЭО", "ЮФ"]);
    expect(await inviteSession(seasonId, tuesday, [snimk.id, law.id])).toMatchObject({ ok: true, invited: 1, skipped: 1 });
  });

  it("без места не пригласить; без факультета — только явно", async () => {
    const none = await candidate(null);
    const nowhere = await session("Где-то", ["МЭО"], { building: "", room: "" });
    expect(await inviteSession(seasonId, nowhere)).toMatchObject({ ok: false });
    const monday = await session("Пн", ["МЭО"]);
    expect(await inviteSession(seasonId, monday)).toMatchObject({ ok: true, invited: 0 });
    expect(await inviteSession(seasonId, monday, [none.id])).toMatchObject({ ok: true, invited: 1 });
    expect((await loadOverview(seasonId)).noFaculty).toBe(0);
  });

  it("счётчики: «резервный день» уходит в резервный сбор", async () => {
    const [a, b, c] = [await candidate("МЭО"), await candidate("МЭО"), await candidate("МЭО")];
    await candidate("МЭО");
    const monday = await session("Пн", ["МЭО"]);
    const reserve = await session("Резерв", [], { reserve: true, startsAt: "2026-10-31T09:00:00.000Z" });
    await inviteSession(seasonId, monday);
    await db.assessmentInvite.update({ where: { applicationId: a.id }, data: { answer: "GOING" } });
    await db.assessmentInvite.update({ where: { applicationId: b.id }, data: { answer: "RESERVE" } });
    await db.assessmentInvite.update({ where: { applicationId: c.id }, data: { answer: "CANT" } });

    const { sessions } = await loadOverview(seasonId);
    const row = (id: string) => sessions.find((item) => item.id === id)!;
    expect(row(monday).counts).toEqual({ invited: 4, going: 1, reserve: 1, cant: 1, silent: 1 });
    expect(row(reserve).counts.going).toBe(1);

    const page = await loadSessionPage(seasonId, reserve, true);
    expect(page!.unassigned.map((person) => person.applicationId)).toEqual([b.id]);
    const mondayPage = await loadSessionPage(seasonId, monday, true);
    // В нераспределённых понедельника — «буду» и молчащий, без «резерва» и «не смогу».
    expect(mondayPage!.unassigned).toHaveLength(2);
  });

  it("напоминание — только молчащим и не чаще раза в час", async () => {
    const [a, b] = [await candidate("МЭО"), await candidate("МЭО")];
    const monday = await session("Пн", ["МЭО"]);
    await inviteSession(seasonId, monday);
    await db.assessmentInvite.update({ where: { applicationId: a.id }, data: { answer: "GOING" } });

    expect(await remindSession(seasonId, monday)).toMatchObject({ ok: true, reminded: 1 });
    expect(await remindSession(seasonId, monday)).toMatchObject({ ok: false });
    expect(await db.notification.count({ where: { userId: b.userId } })).toBe(2);
    expect(await db.notification.count({ where: { userId: a.userId } })).toBe(1);
  });

  it("об изменении места — только после правки и только тем, чей это день, кроме «не смогу»", async () => {
    const [a, b] = [await candidate("МЭО"), await candidate("МЭО")];
    const monday = await session("Пн", ["МЭО"]);
    await inviteSession(seasonId, monday);
    await db.assessmentInvite.update({ where: { applicationId: b.id }, data: { answer: "CANT" } });
    expect(await notifyChange(seasonId, monday)).toMatchObject({ ok: false });

    await saveSession(seasonId, { id: monday, title: "Пн", startsAt: "2026-11-02T15:00:00.000Z", faculties: ["МЭО"], ...base, room: "410" });
    expect((await loadOverview(seasonId)).sessions[0]!.stale).toBe(true);
    expect(await notifyChange(seasonId, monday)).toMatchObject({ ok: true, sent: 1 });
    expect((await loadOverview(seasonId)).sessions[0]!.stale).toBe(false);
    expect(await db.notification.count({ where: { userId: a.userId } })).toBe(2);
    expect(await db.notification.count({ where: { userId: b.userId } })).toBe(1);
  });

  it("удаление сбора убирает приглашения и подгруппы", async () => {
    await candidate("МЭО");
    const monday = await session("Пн", ["МЭО"]);
    await inviteSession(seasonId, monday);
    await db.assessmentGroup.create({ data: { seasonId, sessionId: monday, title: "Подгруппа" } });
    expect(await deleteSession(seasonId, monday)).toMatchObject({ ok: true, invites: 1, groups: 1 });
    expect(await db.assessmentInvite.count()).toBe(0);
    expect(await db.assessmentGroup.count()).toBe(0);
  });
});
