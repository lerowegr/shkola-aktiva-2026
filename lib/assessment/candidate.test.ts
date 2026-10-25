import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { answerInvite, loadCandidateAssessment } from "./candidate";

describe("центр оценки глазами кандидата", () => {
  let seasonId: string;
  let userId: string;
  let applicationId: string;
  let mondayId: string;
  let reserveId: string;
  const before = new Date("2026-10-28T10:00:00Z");

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    await db.stage.create({ data: { seasonId, kind: "ASSESSMENT", title: "Центр оценки", order: 3 } });
    userId = (await db.user.create({ data: { firstName: "А", faculty: "МЭО" } })).id;
    applicationId = (await db.application.create({ data: { seasonId, userId, status: "SUBMITTED", submittedAt: new Date() } })).id;
    const place = { building: "2", room: "305", note: null };
    mondayId = (
      await db.assessmentSession.create({
        data: { seasonId, title: "Пн", startsAt: new Date("2026-11-02T15:00:00Z"), faculties: ["МЭО"], ...place, invited: { ...place, startsAt: "2026-11-02T15:00:00.000Z" } },
      })
    ).id;
    reserveId = (
      await db.assessmentSession.create({ data: { seasonId, title: "Резерв", startsAt: new Date("2026-10-31T09:00:00Z"), reserve: true, building: "Главный", room: "Актовый" } })
    ).id;
  });

  it("без приглашения — ответить нельзя", async () => {
    expect((await loadCandidateAssessment(userId, before))!.invite).toBeNull();
    expect(await answerInvite(userId, "GOING", before)).toMatchObject({ ok: false });
  });

  it("ответы и смена: «резервный день» показывает место резервного", async () => {
    await db.assessmentInvite.create({ data: { sessionId: mondayId, applicationId } });
    let view = (await loadCandidateAssessment(userId, before))!;
    expect(view.invite).toMatchObject({ answer: null, canChange: true, day: { room: "305" }, reserve: { room: "Актовый" } });

    expect(await answerInvite(userId, "RESERVE", before)).toMatchObject({ ok: true });
    view = (await loadCandidateAssessment(userId, before))!;
    expect(view.invite).toMatchObject({ answer: "RESERVE", day: { room: "Актовый", reserve: true } });

    expect(await answerInvite(userId, "GOING", before)).toMatchObject({ ok: true });
    expect((await loadCandidateAssessment(userId, before))!.invite!.day).toMatchObject({ room: "305" });

    expect(await answerInvite(userId, "CANT", before)).toMatchObject({ ok: true });
    expect((await loadCandidateAssessment(userId, before))!.invite!.day).toBeNull();
  });

  it("после начала своего дня ответ не поменять", async () => {
    await db.assessmentInvite.create({ data: { sessionId: mondayId, applicationId, answer: "RESERVE" } });
    const saturday = new Date("2026-10-31T10:00:00Z");
    expect(await answerInvite(userId, "GOING", saturday)).toMatchObject({ ok: false });
    expect((await loadCandidateAssessment(userId, saturday))!.invite!.canChange).toBe(false);
  });

  it("в ответе кабинета нет подгрупп, экспертов и оценок", async () => {
    await db.assessmentInvite.create({ data: { sessionId: mondayId, applicationId, answer: "GOING" } });
    const group = await db.assessmentGroup.create({ data: { seasonId, sessionId: mondayId, title: "Секретная подгруппа", building: "9", room: "999" } });
    await db.assessmentMember.create({ data: { groupId: group.id, applicationId } });
    const json = JSON.stringify(await loadCandidateAssessment(userId, before));
    expect(json).not.toContain("Секретная подгруппа");
    expect(json).not.toContain("999");
    expect(json).not.toMatch(/group|expert|score|review/i);
    expect(reserveId).toBeTruthy();
  });
});
