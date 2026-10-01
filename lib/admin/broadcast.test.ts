import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { segmentUserIds, sendBroadcast } from "./broadcast";

let seasonId: string;
beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
});

async function candidate(status: "DRAFT" | "SUBMITTED", extra: { blocked?: boolean; passedHomework?: boolean } = {}) {
  const user = await db.user.create({ data: { status: extra.blocked ? "BLOCKED" : "ACTIVE" } });
  const application = await db.application.create({ data: { seasonId, userId: user.id, status } });
  if (extra.passedHomework) {
    await db.stageDecision.create({
      data: { applicationId: application.id, stageKind: "HOMEWORK", outcome: "PASSED", publishedAt: new Date() },
    });
  }
  return { user, application };
}

describe("сегменты рассылки", () => {
  it("черновики, отправленные и заблокированные", async () => {
    const draft = await candidate("DRAFT");
    const sent = await candidate("SUBMITTED");
    await candidate("DRAFT", { blocked: true });

    expect(await segmentUserIds(seasonId, "drafts")).toEqual([draft.user.id]);
    expect(await segmentUserIds(seasonId, "submitted")).toEqual([sent.user.id]);
  });

  it("прошли ДЗ, но не записались", async () => {
    const waiting = await candidate("SUBMITTED", { passedHomework: true });
    const booked = await candidate("SUBMITTED", { passedHomework: true });
    const slot = await db.interviewSlot.create({
      data: { seasonId, startsAt: new Date(), endsAt: new Date(), location: "301" },
    });
    await db.interviewBooking.create({ data: { slotId: slot.id, applicationId: booked.application.id } });

    expect(await segmentUserIds(seasonId, "not_booked")).toEqual([waiting.user.id]);
    expect(await segmentUserIds(seasonId, "booked")).toEqual([booked.user.id]);
  });

  it("кандидаты — без организаторов; отправка создаёт уведомления «Важное»", async () => {
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: [] } });
    await db.user.create({ data: { roles: { create: { roleId: role.id } } } });
    const { user } = await candidate("DRAFT");

    expect(await segmentUserIds(seasonId, "candidates")).toEqual([user.id]);
    expect(await sendBroadcast({ seasonId, segment: "candidates", title: "Дедлайн завтра", body: null, url: "/cabinet" })).toBe(1);
    expect(await db.notification.findFirstOrThrow()).toMatchObject({ category: "SYSTEM", title: "Дедлайн завтра" });
  });
});
