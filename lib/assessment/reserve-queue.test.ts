import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~~/lib/db";
import { assessmentFixture } from "~~/lib/test/assessment";
import { answerInvite, chooseSlot, loadCandidateAssessment } from "./candidate";
import { inviteReserveQueue, loadOverview, loadSessionPage } from "./sessions";

describe("очередь резерва предлагает выбрать время, не назначает его", () => {
  const now = new Date("2030-10-26T08:00:00Z"); let f: Awaited<ReturnType<typeof assessmentFixture>>;
  beforeEach(async () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); f = await assessmentFixture(now); });
  afterEach(() => vi.useRealTimers());
  const reserve = () => f.slot({ reserve: true, faculties: [], startsAt: new Date("2030-10-31T09:00:00Z"), capacity: 1 });

  it("без резервных слотов очередь сохраняется, повтор не меняет позицию", async () => {
    const a = await f.slot(); const p = await f.person(a.id);
    expect((await answerInvite(p.userId, "RESERVE", now)).ok).toBe(true);
    const before = await db.assessmentInvite.findUniqueOrThrow({ where: { id: p.inviteId } });
    await answerInvite(p.userId, "RESERVE", new Date(now.getTime() + 1000));
    expect((await db.assessmentInvite.findUniqueOrThrow({ where: { id: p.inviteId } })).answeredAt).toEqual(before.answeredAt);
    expect((await inviteReserveQueue(f.seasonId, now)).ok).toBe(false);
    expect((await loadCandidateAssessment(p.userId, now))!.invite).toMatchObject({ day: null, reserveQueued: true });
  });

  it("создание резервного времени не назначает день и не занимает места", async () => {
    const a = await f.slot(); const p = await f.person(a.id, { answer: "RESERVE", queued: true }); const r = await reserve();
    expect((await loadCandidateAssessment(p.userId, now))!.invite!.day).toBeNull();
    expect((await loadOverview(f.seasonId)).sessions.find((s) => s.id === r.id)!.occupied).toBe(0);
    expect((await loadSessionPage(f.seasonId, r.id, true))!.unassigned).toEqual([]);
    expect(await db.notification.count()).toBe(0);
  });

  it("всем ожидающим отправляется предложение, слот бронирует только выбравший", async () => {
    const a = await f.slot(); const p = await f.person(a.id, { answer: "RESERVE", queued: true }); const q = await f.person(a.id, { answer: "RESERVE", queued: true }); const r = await reserve();
    expect(await inviteReserveQueue(f.seasonId, now)).toMatchObject({ ok: true, invited: 2, waiting: 0 });
    expect((await loadOverview(f.seasonId)).reserveQueue).toHaveLength(2);
    expect((await chooseSlot(p.userId, r.id, now)).ok).toBe(true);
    expect((await chooseSlot(q.userId, r.id, now)).ok).toBe(false);
    expect((await loadOverview(f.seasonId)).reserveQueue).toHaveLength(1);
    expect(await inviteReserveQueue(f.seasonId, now)).toMatchObject({ invited: 0 });
    expect(await db.notification.count()).toBe(2);
  });

  it("параллельные рассылки не дублируют предложение", async () => {
    const a = await f.slot(); await f.person(a.id, { answer: "RESERVE", queued: true }); await reserve();
    const results = await Promise.all([inviteReserveQueue(f.seasonId, now), inviteReserveQueue(f.seasonId, now)]);
    expect(results.reduce((n, r) => n + (r.ok ? r.invited : 0), 0)).toBe(1);
    expect(await db.notification.count()).toBe(1);
  });

  it("резервные времена фильтруются по факультету; общие доступны всем", async () => {
    const a = await f.slot(); const p = await f.person(a.id, { faculty: "МЭО" });
    const common = await reserve();
    await f.slot({ reserve: true, faculties: ["ЮФ"], startsAt: new Date("2030-10-31T12:00:00Z") });
    expect((await loadCandidateAssessment(p.userId, now))!.invite!.reserveSlots.map((s) => s.id)).toEqual([common.id]);
  });

  it("прежние назначения сохраняются, кандидат не занимает повторно резерв", async () => {
    const a = await f.slot(); const p = await f.person(a.id, { answer: "RESERVE" }); const r = await reserve();
    expect((await loadCandidateAssessment(p.userId, now))!.invite!.day).toMatchObject({ reserve: true });
    expect((await loadOverview(f.seasonId)).sessions.find((s) => s.id === r.id)!.occupied).toBe(1);
  });

  it("нет рассылки заблокированным, а очередь не раскрывается обычному эксперту", async () => {
    const a = await f.slot(); const p = await f.person(a.id, { answer: "RESERVE", queued: true }); await reserve();
    await db.user.update({ where: { id: p.userId }, data: { status: "BLOCKED" } });
    expect(await inviteReserveQueue(f.seasonId, now)).toMatchObject({ invited: 0 });
    expect((await loadOverview(f.seasonId, "expert")).reserveQueue).toEqual([]);
  });
});
