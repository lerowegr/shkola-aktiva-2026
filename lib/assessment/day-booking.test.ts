import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~~/lib/db";
import { assessmentFixture } from "~~/lib/test/assessment";
import { answerInvite, chooseSlot, loadCandidateAssessment } from "./candidate";
import { placeMember, saveGroup } from "./groups";
import { inviteSession, loadOverview, messageSession, saveSession } from "./sessions";

describe("день → факультет → время: границы и сохранение данных", () => {
  const now = new Date("2030-10-26T08:00:00Z"); let f: Awaited<ReturnType<typeof assessmentFixture>>;
  beforeEach(async () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); f = await assessmentFixture(now); });
  afterEach(() => vi.useRealTimers());

  it("ровно за 2 часа перенос и отказ допустимы, за 1:59:59 — нет", async () => {
    const a = await f.slot(); const b = await f.slot({ startsAt: new Date("2030-10-26T16:00:00Z") });
    const p = await f.person(a.id, { answer: "GOING" }); const q = await f.person(a.id, { answer: "GOING" });
    const cutoff = new Date("2030-10-26T12:00:00Z");
    expect((await chooseSlot(p.userId, b.id, new Date(cutoff.getTime() + 1000))).ok).toBe(false);
    expect((await answerInvite(q.userId, "CANT", new Date(cutoff.getTime() + 1000))).ok).toBe(false);
    expect((await chooseSlot(p.userId, b.id, cutoff)).ok).toBe(true);
    expect((await answerInvite(q.userId, "CANT", cutoff)).ok).toBe(true);
  });

  it("новая запись менее чем за 2 часа закрыта; доступны резерв/отказ", async () => {
    const a = await f.slot(); const p = await f.person(a.id); const late = new Date("2030-10-26T12:00:01Z");
    expect((await chooseSlot(p.userId, a.id, late)).ok).toBe(false);
    expect((await loadCandidateAssessment(p.userId, late))!.invite!.slots[0]!.closed).toBe(true);
    expect((await answerInvite(p.userId, "RESERVE", late)).ok).toBe(true);
    expect((await answerInvite(p.userId, "CANT", late)).ok).toBe(true);
  });

  it("отказ и резерв после границы не меняют ни слот, ни подгруппу", async () => {
    const a = await f.slot(); const p = await f.person(a.id, { answer: "GOING" });
    const g = await db.assessmentGroup.create({ data: { seasonId: f.seasonId, sessionId: a.id, title: "А", faculty: "МЭО" } });
    await db.assessmentMember.create({ data: { applicationId: p.applicationId, groupId: g.id } });
    for (const answer of ["RESERVE", "CANT"] as const) expect((await answerInvite(p.userId, answer, new Date("2030-10-26T13:00:00Z"))).ok).toBe(false);
    expect((await db.assessmentInvite.findUniqueOrThrow({ where: { id: p.inviteId } })).answer).toBe("GOING");
    expect(await db.assessmentMember.count()).toBe(1);
  });

  it("занятое время сохраняет прежнюю запись; успешный перенос снимает подгруппу, сохраняя оценки", async () => {
    const a = await f.slot(); const b = await f.slot({ startsAt: new Date("2030-10-26T16:00:00Z"), capacity: 1 });
    const p = await f.person(a.id, { answer: "GOING" }); const q = await f.person(b.id, { answer: "GOING" });
    const g = await db.assessmentGroup.create({ data: { seasonId: f.seasonId, sessionId: a.id, title: "А", faculty: "МЭО" } });
    await db.assessmentMember.create({ data: { applicationId: p.applicationId, groupId: g.id } });
    const review = await db.review.create({ data: { applicationId: p.applicationId, stageKind: "ASSESSMENT", reviewerId: q.userId, comment: "Начатая оценка" } });
    expect((await chooseSlot(p.userId, b.id, now)).ok).toBe(false); expect(await db.assessmentMember.count()).toBe(1);
    await answerInvite(q.userId, "CANT", now);
    expect((await chooseSlot(p.userId, b.id, now)).ok).toBe(true);
    expect(await db.assessmentMember.count()).toBe(0);
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).comment).toBe("Начатая оценка");
  });

  it("день/факультет приглашения сохраняются при выборе и изменении профиля", async () => {
    const a = await f.slot(); const b = await f.slot({ startsAt: new Date("2030-10-26T16:00:00Z") });
    const p = await f.person(a.id); await db.assessmentInvite.delete({ where: { id: p.inviteId } });
    await inviteSession(f.seasonId, a.id);
    await db.user.update({ where: { id: p.userId }, data: { faculty: "ЮФ" } });
    expect((await chooseSlot(p.userId, b.id, now)).ok).toBe(true);
    expect((await loadCandidateAssessment(p.userId, now))!.invite).toMatchObject({ invitedDay: "2030-10-26", faculty: "МЭО" });
  });

  it("чужие день, факультет и сезон не проходят прямым запросом", async () => {
    const a = await f.slot(); const p = await f.person(a.id);
    const wrongFaculty = await f.slot({ faculties: ["ЮФ"] }); const wrongDay = await f.slot({ startsAt: new Date("2030-10-27T14:00:00Z") });
    const other = await db.season.create({ data: { slug: "other", title: "Other", year: 2031 } });
    const wrongSeason = await db.assessmentSession.create({ data: { seasonId: other.id, title: "Нет", startsAt: a.startsAt, faculties: ["МЭО"], building: "2", room: "305" } });
    for (const s of [wrongFaculty, wrongDay, wrongSeason]) expect((await chooseSlot(p.userId, s.id, now)).ok).toBe(false);
  });

  it("рассылка выбранному факультету не бронирует время и не дублируется", async () => {
    const a = await f.slot({ faculties: ["МЭО", "СНиМК"] }); const p = await f.person(a.id); const q = await f.person(a.id, { faculty: "СНиМК" });
    await db.assessmentInvite.deleteMany({ where: { id: { in: [p.inviteId, q.inviteId] } } });
    expect(await inviteSession(f.seasonId, a.id, undefined, "МЭО")).toMatchObject({ invited: 1 });
    expect((await loadCandidateAssessment(p.userId, now))!.invite!.day).toBeNull();
    expect((await loadCandidateAssessment(q.userId, now))!.invite).toBeNull();
    expect(await inviteSession(f.seasonId, a.id, undefined, "МЭО")).toMatchObject({ invited: 0 });
  });

  it("резервный день содержит несколько времён, но не растягивается на разные дни", async () => {
    const input = { title: "Резерв", building: "2", room: "305", startsAt: "2030-10-31T09:00:00Z", note: "", faculties: ["МЭО"], reserve: true };
    expect((await saveSession(f.seasonId, input)).ok).toBe(true);
    expect((await saveSession(f.seasonId, { ...input, startsAt: "2030-10-31T12:00:00Z", faculties: ["ЮФ"] })).ok).toBe(true);
    expect((await saveSession(f.seasonId, { ...input, startsAt: "2030-11-01T12:00:00Z" })).ok).toBe(false);
  });

  it("подгруппы разделяют факультет и время; перенос не меняет бронь", async () => {
    const a = await f.slot({ faculties: ["МЭО", "СНиМК"] }); const p = await f.person(a.id, { answer: "GOING" });
    const g1 = await saveGroup(f.seasonId, { sessionId: a.id, title: "МЭО 1", faculty: "МЭО" });
    const g2 = await saveGroup(f.seasonId, { sessionId: a.id, title: "МЭО 2", faculty: "МЭО" });
    const alien = await saveGroup(f.seasonId, { sessionId: a.id, title: "СНиМК", faculty: "СНиМК" });
    expect((await saveGroup(f.seasonId, { sessionId: a.id, title: "Без факультета" })).ok).toBe(false);
    if (!g1.ok || !g2.ok || !alien.ok) throw Error("Подгруппы не созданы");
    expect((await placeMember(f.seasonId, p.applicationId, g1.id, null)).ok).toBe(true);
    expect((await placeMember(f.seasonId, p.applicationId, alien.id, null)).ok).toBe(false);
    expect((await placeMember(f.seasonId, p.applicationId, g2.id, null)).ok).toBe(true);
    expect((await db.assessmentInvite.findUniqueOrThrow({ where: { id: p.inviteId } })).sessionId).toBe(a.id);
  });

  it("сообщение времени получают только записанные, не молчащие/очередь/отказы", async () => {
    const a = await f.slot(); await f.person(a.id, { answer: "GOING" }); await f.person(a.id); await f.person(a.id, { answer: "CANT" }); await f.person(a.id, { answer: "RESERVE", queued: true });
    expect(await messageSession(f.seasonId, a.id, "Вход со двора")).toMatchObject({ ok: true, sent: 1 });
    expect(await db.notification.count()).toBe(1);
  });

  it("граница времени использует опубликованный снимок, не скрытую правку", async () => {
    const a = await f.slot(); const p = await f.person(a.id);
    await db.assessmentSession.update({ where: { id: a.id }, data: { invited: { building: "2", room: "305", startsAt: "2030-10-26T14:00:00Z", note: null }, startsAt: new Date("2030-10-26T10:00:00Z") } });
    expect((await chooseSlot(p.userId, a.id, new Date("2030-10-26T11:00:00Z"))).ok).toBe(true);
    expect((await loadCandidateAssessment(p.userId, now))!.invite!.day!.startsAt).toBe("2030-10-26T14:00:00Z");
    expect((await loadOverview(f.seasonId)).sessions[0]!.stale).toBe(true);
  });
});
