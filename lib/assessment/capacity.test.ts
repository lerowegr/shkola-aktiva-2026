import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~~/lib/db";
import { assessmentFixture } from "~~/lib/test/assessment";
import { answerInvite, chooseSlot } from "./candidate";
import { autoInvite, inviteSession, loadOverview, saveSession } from "./sessions";

describe("вместимость выбранного времени, не рассылки", () => {
  const now = new Date("2030-10-26T08:00:00Z");
  let f: Awaited<ReturnType<typeof assessmentFixture>>;
  beforeEach(async () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); f = await assessmentFixture(now); });
  afterEach(() => vi.useRealTimers());
  const input = { title: "Слот", building: "2", room: "305", startsAt: "2030-10-26T14:00:00Z", note: "", faculties: ["МЭО"], reserve: false };

  it("по умолчанию 50, лимит валидируется", async () => {
    const result = await saveSession(f.seasonId, input);
    expect(result.ok).toBe(true);
    for (const capacity of [0, -1, 1.5, 10001]) expect(await saveSession(f.seasonId, { ...input, capacity })).toMatchObject({ ok: false });
    if (result.ok) expect((await db.assessmentSession.findUniqueOrThrow({ where: { id: result.id } })).capacity).toBe(50);
  });

  it("66 приглашений на день не занимают мест и не назначают второй слот", async () => {
    const a = await f.slot(); const b = await f.slot({ startsAt: new Date("2030-10-26T16:00:00Z") });
    for (let i = 0; i < 66; i++) { const u = await db.user.create({ data: { faculty: "МЭО" } }); await db.application.create({ data: { seasonId: f.seasonId, userId: u.id, status: "SUBMITTED", submittedAt: now } }); }
    expect(await inviteSession(f.seasonId, a.id)).toMatchObject({ ok: true, invited: 66, overflow: 0 });
    expect(await db.assessmentInvite.count({ where: { sessionId: b.id } })).toBe(0);
    expect((await loadOverview(f.seasonId)).sessions.every((s) => s.occupied === 0)).toBe(true);
    expect(await inviteSession(f.seasonId, b.id)).toMatchObject({ invited: 0, skipped: 66 });
    expect(await db.notification.count()).toBe(66);
  });

  it("первые 50 выбирают первое время, 16 — второе; 51-я запись запрещена", async () => {
    const a = await f.slot(); const b = await f.slot({ startsAt: new Date("2030-10-26T16:00:00Z") });
    const people = []; for (let i = 0; i < 66; i++) people.push(await f.person(a.id));
    for (const p of people.slice(0, 50)) expect((await chooseSlot(p.userId, a.id, now)).ok).toBe(true);
    expect((await chooseSlot(people[50]!.userId, a.id, now)).ok).toBe(false);
    for (const p of people.slice(50)) expect((await chooseSlot(p.userId, b.id, now)).ok).toBe(true);
    expect((await loadOverview(f.seasonId)).sessions.map((s) => s.occupied)).toEqual([50, 16]);
  }, 20_000);

  it("конкурентные запросы на последнее место дают одну запись", async () => {
    const a = await f.slot({ capacity: 1 }); const people = [await f.person(a.id), await f.person(a.id), await f.person(a.id)];
    const results = await Promise.all(people.map((p) => chooseSlot(p.userId, a.id, now)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await loadOverview(f.seasonId)).sessions[0]!.occupied).toBe(1);
  });

  it("отказ/резерв освобождают место; повтор отказа не меняет состояние", async () => {
    const a = await f.slot({ capacity: 1 }); const p = await f.person(a.id); const q = await f.person(a.id);
    await chooseSlot(p.userId, a.id, now); await answerInvite(p.userId, "RESERVE", now);
    expect((await loadOverview(f.seasonId)).sessions[0]!.occupied).toBe(0);
    expect((await chooseSlot(q.userId, a.id, now)).ok).toBe(true);
    await answerInvite(q.userId, "CANT", now); await answerInvite(q.userId, "CANT", now);
    expect((await loadOverview(f.seasonId)).sessions[0]!.occupied).toBe(0);
  });

  it("лимит нельзя уменьшить ниже записанных, но можно ниже числа приглашений", async () => {
    const a = await f.slot(); const p = await f.person(a.id); await f.person(a.id); await f.person(a.id);
    expect((await saveSession(f.seasonId, { ...input, id: a.id, capacity: 1 })).ok).toBe(true);
    await chooseSlot(p.userId, a.id, now);
    expect((await loadOverview(f.seasonId)).sessions[0]!.occupied).toBe(1);
    // Двое подтверждённых, лимит уменьшать нельзя.
    await db.assessmentSession.update({ where: { id: a.id }, data: { capacity: 2 } });
    const q = await f.person(a.id); await chooseSlot(q.userId, a.id, now);
    expect((await saveSession(f.seasonId, { ...input, id: a.id, capacity: 1 })).ok).toBe(false);
  });

  it("у объединённого слота общий лимит для двух факультетов", async () => {
    const a = await f.slot({ faculties: ["МЭО", "СНиМК"], capacity: 1 });
    const p = await f.person(a.id); const q = await f.person(a.id, { faculty: "СНиМК" });
    expect((await chooseSlot(p.userId, a.id, now)).ok).toBe(true);
    expect((await chooseSlot(q.userId, a.id, now)).ok).toBe(false);
  });

  it("поздние анкеты приглашаются в день начатой рассылки, не занимая время", async () => {
    const a = await f.slot({ capacity: 1 }); const p = await f.person(a.id, { answer: "GOING" });
    await db.assessmentSession.update({ where: { id: a.id }, data: { invitedAt: now } });
    const q = await f.person(a.id); await db.assessmentInvite.delete({ where: { id: q.inviteId } });
    expect(await autoInvite(q.applicationId, now)).toBe(true);
    expect((await loadOverview(f.seasonId)).sessions[0]!.occupied).toBe(1);
    expect((await db.assessmentInvite.findUniqueOrThrow({ where: { applicationId: p.applicationId } })).answer).toBe("GOING");
  });

  it("несколько времён резерва не удваивают прежние назначения", async () => {
    const a = await f.slot(); await f.person(a.id, { answer: "RESERVE" });
    const r = await f.slot({ reserve: true, startsAt: new Date("2030-10-31T09:00:00Z"), faculties: [], capacity: 1 });
    const r2 = await f.slot({ reserve: true, startsAt: new Date("2030-10-31T12:00:00Z"), faculties: [] });
    const rows = (await loadOverview(f.seasonId)).sessions;
    expect(rows.find((s) => s.id === r.id)!.occupied).toBe(1);
    expect(rows.find((s) => s.id === r2.id)!.occupied).toBe(0);
  });
});
