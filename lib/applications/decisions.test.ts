import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { candidateDecision, promoteReserve, publishDecisions, rankFinal, rankForStage, setDecision } from "./decisions";
import { saveScore } from "./review-store";

let seasonId: string;
let lead: { id: string };
let master: { id: string };
let interest: { id: string };

beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  lead = await db.user.create({ data: { firstName: "Главный" } });
  master = await db.user.create({ data: { firstName: "Катя" } });
  interest = await db.criterion.create({
    data: { seasonId, stageKind: "APPLICATION", order: 1, title: "Интерес", maxScore: 4, levels: [] },
  });
});

async function candidate(name: string, score: number | null) {
  const user = await db.user.create({ data: { firstName: name } });
  const application = await db.application.create({
    data: { seasonId, userId: user.id, status: "SUBMITTED", lastName: name, firstName: "И", submittedAt: new Date() },
  });
  const review = await db.review.create({ data: { applicationId: application.id, stageKind: "APPLICATION", reviewerId: master.id } });
  if (score !== null) await saveScore({ reviewId: review.id, actorId: master.id, criterionId: interest.id, score });
  return { user, application };
}

describe("решения по этапу", () => {
  it("в итогах показывает факультет и фактическую явку на ЦО", async () => {
    const present = await candidate("Был", 4);
    const absent = await candidate("НеБыл", 2);
    await db.user.update({ where: { id: present.user.id }, data: { faculty: "ЮФ" } });
    const session = await db.assessmentSession.create({ data: { seasonId, title: "ЦО", startsAt: new Date("2026-10-30T10:00:00+03:00") } });
    await db.assessmentInvite.create({ data: { applicationId: present.application.id, sessionId: session.id, attended: true } });
    const rows = await rankFinal(seasonId);
    expect(rows.find(row => row.id === present.application.id)).toMatchObject({ faculty: "ЮФ", assessmentPassed: true });
    expect(rows.find(row => row.id === absent.application.id)).toMatchObject({ faculty: null, assessmentPassed: false });
  });
  it("показывает последний внутренний комментарий в итогах независимо от решения", async () => {
    const { application, user } = await candidate("Алина", 4);
    await db.finalDecisionComment.createMany({ data: [
      { applicationId: application.id, authorId: lead.id, body: "Сильная анкета", createdAt: new Date("2026-11-09T09:00:00+03:00") },
      { applicationId: application.id, authorId: lead.id, body: "Обсудить на итоговой встрече", createdAt: new Date("2026-11-09T10:00:00+03:00") },
    ] });
    await setDecision(application.id, "INTERVIEW", "RESERVE", lead.id);

    expect((await rankFinal(seasonId))[0]).toMatchObject({ commentCount: 2, latestComment: "Обсудить на итоговой встрече" });
    expect(await candidateDecision(user.id, seasonId, "INTERVIEW")).toBeNull();
    await setDecision(application.id, "INTERVIEW", "PASSED", lead.id);
    expect((await rankFinal(seasonId))[0]).toMatchObject({ commentCount: 2, latestComment: "Обсудить на итоговой встрече" });
  });
  it("рейтинг — по среднему итогу, лучшие сверху, непроверенные внизу", async () => {
    await candidate("Средний", 2);
    await candidate("Лучший", 4);
    await candidate("Непроверенный", null);

    const rows = await rankForStage(seasonId, "APPLICATION");
    expect(rows.map((row) => row.name)).toEqual(["Лучший И", "Средний И", "Непроверенный И"]);
    expect(rows[0]).toMatchObject({ average: 4, max: 4, reviewed: 1, reviewers: 1 });
  });

  it("решение без публикации кандидату не видно", async () => {
    const { user, application } = await candidate("Алина", 4);
    await setDecision(application.id, "APPLICATION", "PASSED", lead.id);

    expect(await candidateDecision(user.id, seasonId, "APPLICATION")).toBeNull();
    expect(await db.notification.count()).toBe(0);
  });

  it("публикация открывает решения и уведомляет каждого один раз", async () => {
    const a = await candidate("Алина", 4);
    const b = await candidate("Борис", 1);
    await setDecision(a.application.id, "APPLICATION", "PASSED", lead.id);
    await setDecision(b.application.id, "APPLICATION", "REJECTED", lead.id);

    expect(await publishDecisions(seasonId, "APPLICATION")).toEqual({ passed: 1, reserve: 0, rejected: 1 });
    expect(await candidateDecision(a.user.id, seasonId, "APPLICATION")).toBe("PASSED");
    expect(await candidateDecision(b.user.id, seasonId, "APPLICATION")).toBe("REJECTED");
    expect(await db.notification.count()).toBe(2);

    // Повторная публикация без новых решений никого не трогает.
    expect(await publishDecisions(seasonId, "APPLICATION")).toEqual({ passed: 0, reserve: 0, rejected: 0 });
    expect(await db.notification.count()).toBe(2);
  });

  it("опубликованное решение менять нельзя", async () => {
    const { application } = await candidate("Алина", 4);
    await setDecision(application.id, "APPLICATION", "PASSED", lead.id);
    await publishDecisions(seasonId, "APPLICATION");

    const result = await setDecision(application.id, "APPLICATION", "REJECTED", lead.id);
    expect(result.ok).toBe(false);
  });

  it("публикует резерв отдельно, затем допускает только однократное повышение", async () => {
    const { user, application } = await candidate("Алина", 4);
    expect(await setDecision(application.id, "APPLICATION", "RESERVE", lead.id)).toMatchObject({ ok: false });
    expect(await setDecision(application.id, "INTERVIEW", "RESERVE", lead.id)).toEqual({ ok: true });
    expect(await candidateDecision(user.id, seasonId, "INTERVIEW")).toBeNull();
    expect(await promoteReserve(application.id, seasonId, lead.id)).toMatchObject({ ok: false });

    expect(await publishDecisions(seasonId, "INTERVIEW")).toEqual({ passed: 0, reserve: 1, rejected: 0 });
    expect(await candidateDecision(user.id, seasonId, "INTERVIEW")).toBeNull();
    expect(await db.notification.count({ where: { userId: user.id } })).toBe(0);
    expect(await setDecision(application.id, "INTERVIEW", "REJECTED", lead.id)).toMatchObject({ ok: false });

    expect(await promoteReserve(application.id, seasonId, lead.id)).toMatchObject({ ok: true, userId: user.id });
    expect(await candidateDecision(user.id, seasonId, "INTERVIEW")).toBe("PASSED");
    expect(await promoteReserve(application.id, seasonId, lead.id)).toMatchObject({ ok: false });
  });

  it("снять неопубликованное решение можно", async () => {
    const { application } = await candidate("Алина", 4);
    await setDecision(application.id, "APPLICATION", "PASSED", lead.id);
    await setDecision(application.id, "APPLICATION", null, lead.id);
    expect(await db.stageDecision.count()).toBe(0);
  });
});
