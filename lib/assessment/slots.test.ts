import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { answerInvite, chooseSlot, loadCandidateAssessment } from "./candidate";

describe("выбор другого времени ЦО того же дня", () => {
  let seasonId: string;
  const now = new Date("2026-10-26T08:00:00Z"); // 11:00 МСК
  const at = (iso: string) => new Date(iso);

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    await db.stage.create({ data: { seasonId, kind: "ASSESSMENT", title: "Центр оценки", order: 3 } });
  });

  async function session(title: string, startsAt: string, faculties: string[], capacity = 50) {
    return db.assessmentSession.create({ data: { seasonId, title, startsAt: at(startsAt), faculties, capacity, building: "2", room: "305" } });
  }
  async function candidate(faculty: string, sessionId: string, answer: "GOING" | "CANT" | null = null) {
    const user = await db.user.create({ data: { faculty } });
    const application = await db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED", submittedAt: now } });
    await db.assessmentInvite.create({ data: { sessionId, applicationId: application.id, answer } });
    return user.id;
  }

  it("видит свои слоты этого дня, без чужих факультетов, других дней и начавшихся", async () => {
    const early = await session("17:20", "2026-10-26T14:20:00Z", ["МЭО", "СНиМК"]);
    const late = await session("18:50", "2026-10-26T15:50:00Z", ["МЭО", "СНиМК"]);
    await session("Чужой", "2026-10-26T17:25:00Z", ["ЮФ"]);
    await session("Вторник", "2026-10-27T14:20:00Z", ["МЭО"]);
    await session("Утро", "2026-10-26T07:00:00Z", ["МЭО"]);
    const userId = await candidate("МЭО", early.id, "CANT");

    const slots = (await loadCandidateAssessment(userId, now))!.invite!.slots;
    expect(slots.map((slot) => [slot.id, slot.current])).toEqual([
      [early.id, true],
      [late.id, false],
    ]);
  });

  it("после «не смогу» записывается на другое время; места считаются", async () => {
    const early = await session("17:20", "2026-10-26T14:20:00Z", ["МЭО"]);
    const late = await session("18:50", "2026-10-26T15:50:00Z", ["МЭО"], 1);
    const userId = await candidate("МЭО", early.id, "CANT");

    expect(await chooseSlot(userId, late.id, now)).toMatchObject({ ok: true, movedFrom: early.id });
    const invite = await db.assessmentInvite.findFirstOrThrow({ where: { application: { userId } } });
    expect(invite).toMatchObject({ sessionId: late.id, answer: "GOING", reserveQueued: false });
    expect((await loadCandidateAssessment(userId, now))!.invite!.day).toMatchObject({ title: "18:50" });

    // Место в 18:50 было одно — второму не достанется.
    const other = await candidate("МЭО", early.id, "CANT");
    expect(await chooseSlot(other, late.id, now)).toMatchObject({ ok: false });
    // А вернуться на своё время можно.
    expect(await chooseSlot(userId, early.id, now)).toMatchObject({ ok: true });
  });

  it("нельзя на чужой факультет и после начала своего времени", async () => {
    const early = await session("17:20", "2026-10-26T14:20:00Z", ["МЭО"]);
    const law = await session("ЮФ", "2026-10-26T15:50:00Z", ["ЮФ"]);
    const late = await session("18:50", "2026-10-26T15:50:00Z", ["МЭО"]);
    const userId = await candidate("МЭО", early.id, "GOING");
    expect(await chooseSlot(userId, law.id, now)).toMatchObject({ ok: false });
    expect(await chooseSlot(userId, late.id, at("2026-10-26T14:30:00Z"))).toMatchObject({ ok: false });
    expect(await answerInvite(userId, "CANT", now)).toMatchObject({ ok: true });
  });

  it("место держит только «буду»: молчащие не занимают, заполненное видно как занятое", async () => {
    const early = await session("17:20", "2026-10-26T14:20:00Z", ["МЭО"], 1);
    const late = await session("18:50", "2026-10-26T15:50:00Z", ["МЭО"], 1);
    const silent = await candidate("МЭО", early.id);
    const mover = await candidate("МЭО", late.id);

    // Молчащий не держит 17:20 — его занимает тот, кто выбрал первым.
    expect(await chooseSlot(mover, early.id, now)).toMatchObject({ ok: true });
    const slots = (await loadCandidateAssessment(silent, now))!.invite!.slots;
    expect(slots.find((slot) => slot.id === early.id)).toMatchObject({ current: true, full: true });
    expect(await answerInvite(silent, "GOING", now)).toMatchObject({ ok: false });
    expect(await chooseSlot(silent, late.id, now)).toMatchObject({ ok: true });
  });

  it("приглашение на день с несколькими временами зовёт выбрать время и не называет число мест", async () => {
    const { inviteSession } = await import("./sessions");
    const first = await session("17:20", "2030-10-27T14:20:00Z", ["НАБ"], 50);
    await session("18:50", "2030-10-27T15:50:00Z", ["НАБ"], 20);
    const user = await db.user.create({ data: { faculty: "НАБ" } });
    await db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED", submittedAt: now } });
    expect(await inviteSession(seasonId, first.id)).toMatchObject({ ok: true, invited: 1 });
    const note = await db.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(note.title).toBe("Центр оценки — выберите время");
    expect(note.body).toContain("17:20, 18:50");
    expect(note.body).not.toMatch(/\b(50|20) мест/);
  });
});
