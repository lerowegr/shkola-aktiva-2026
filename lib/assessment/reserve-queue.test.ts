import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { answerInvite, loadCandidateAssessment } from "./candidate";
import {
  inviteReserveQueue,
  loadOverview,
  loadSessionPage,
  notifyChange,
  saveSession,
} from "./sessions";

describe("очередь резервного дня ЦО", () => {
  const now = new Date("2026-10-25T22:00:00Z");
  let seasonId: string;
  let sessionId: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    await resetDatabase();
    seasonId = (
      await db.season.create({
        data: { slug: "queue", title: "S", year: 2026, isCurrent: true },
      })
    ).id;
    await db.stage.create({
      data: { seasonId, kind: "ASSESSMENT", title: "Центр оценки", order: 3 },
    });
    sessionId = (
      await db.assessmentSession.create({
        data: {
          seasonId,
          title: "Основной",
          building: "2",
          room: "305",
          startsAt: new Date("2026-11-02T09:00:00Z"),
          faculties: ["МЭО"],
        },
      })
    ).id;
  });
  afterEach(() => vi.useRealTimers());

  async function person(index = 0, queued = false) {
    const user = await db.user.create({
      data: {
        firstName: "Кандидат",
        faculty: "МЭО",
        telegramId: String(900000 + index),
      },
    });
    const application = await db.application.create({
      data: {
        seasonId,
        userId: user.id,
        status: "SUBMITTED",
        firstName: `Кандидат ${index}`,
        submittedAt: now,
      },
    });
    await db.assessmentInvite.create({
      data: {
        sessionId,
        applicationId: application.id,
        ...(queued
          ? {
              answer: "RESERVE",
              reserveQueued: true,
              answeredAt: new Date(now.getTime() + index * 1000),
            }
          : {}),
      },
    });
    return { userId: user.id, applicationId: application.id };
  }
  async function reserve(capacity = 50, startsAt = "2026-11-03T09:00:00Z") {
    const result = await saveSession(seasonId, {
      title: "Резерв",
      building: "Главный",
      room: "Актовый",
      startsAt,
      note: "Вход со двора",
      faculties: [],
      reserve: true,
      capacity,
    });
    if (!result.ok) throw new Error(result.message);
    return result.id;
  }

  it("без резервного дня сохраняет ответ в очереди; повтор не меняет время и не создаёт уведомление", async () => {
    const a = await person();
    expect(await answerInvite(a.userId, "RESERVE", now)).toMatchObject({
      ok: true,
      message: expect.stringContaining("очереди"),
    });
    expect(
      (await loadCandidateAssessment(a.userId, now))!.invite,
    ).toMatchObject({
      reserveQueued: true,
      answer: "RESERVE",
      day: null,
      canChange: true,
    });
    expect(
      await answerInvite(a.userId, "RESERVE", new Date(now.getTime() + 1000)),
    ).toMatchObject({ ok: true });
    expect(
      await db.assessmentInvite.findUniqueOrThrow({
        where: { applicationId: a.applicationId },
      }),
    ).toMatchObject({ answeredAt: now, sessionId });
    expect(await db.assessmentInvite.count()).toBe(1);
    expect(await db.notification.count()).toBe(0);
    expect(await inviteReserveQueue(seasonId, now)).toMatchObject({
      ok: false,
      message: expect.stringContaining("Очередь сохранена"),
    });
  });

  it("создание резервного сбора не назначает день, не занимает резервные места и не уведомляет", async () => {
    const a = await person(0, true);
    const id = await reserve(1);
    expect(
      (await loadCandidateAssessment(a.userId, now))!.invite,
    ).toMatchObject({ reserveQueued: true, day: null });
    expect(
      (await loadOverview(seasonId)).sessions.find((item) => item.id === id),
    ).toMatchObject({ occupied: 0 });
    expect(
      (await loadSessionPage(seasonId, id, true))!.unassigned,
    ).toHaveLength(0);
    expect(await db.notification.count()).toBe(0);
  });

  it("рассылка берёт первые 50, оставляет 16, сохраняет исходные приглашения и публикует снимок", async () => {
    const people = [];
    for (let index = 0; index < 66; index++)
      people.push(await person(index, true));
    const original = await db.assessmentInvite.findMany({
      orderBy: { id: "asc" },
    });
    const id = await reserve();
    expect(await inviteReserveQueue(seasonId, now)).toMatchObject({
      ok: true,
      invited: 50,
      waiting: 16,
    });
    const after = await db.assessmentInvite.findMany({
      orderBy: { id: "asc" },
    });
    expect(
      after.map(({ id, sessionId, invitedAt, answeredAt }) => ({
        id,
        sessionId,
        invitedAt,
        answeredAt,
      })),
    ).toEqual(
      original.map(({ id, sessionId, invitedAt, answeredAt }) => ({
        id,
        sessionId,
        invitedAt,
        answeredAt,
      })),
    );
    const assigned = after
      .filter((item) => !item.reserveQueued)
      .map((item) => item.applicationId)
      .sort();
    expect(assigned).toEqual(
      people
        .slice(0, 50)
        .map((item) => item.applicationId)
        .sort(),
    );
    expect(
      (await loadOverview(seasonId)).sessions.find((item) => item.id === id),
    ).toMatchObject({ occupied: 50 });
    expect((await loadOverview(seasonId)).reserveQueue).toHaveLength(16);
    expect(
      (await loadCandidateAssessment(people[0]!.userId, now))!.invite,
    ).toMatchObject({
      reserveQueued: false,
      day: { reserve: true, room: "Актовый" },
    });
    expect(
      (await db.assessmentSession.findUniqueOrThrow({ where: { id } })).invited,
    ).toMatchObject({ room: "Актовый" });
    expect(await db.notification.count()).toBe(50);
    const delivery = await db.notificationDelivery.findFirstOrThrow();
    expect(delivery.scheduledAt.getTime()).toBeLessThanOrEqual(
      now.getTime() + 60_000,
    );
    expect(await inviteReserveQueue(seasonId, now)).toMatchObject({
      ok: true,
      invited: 0,
      waiting: 16,
    });
    expect(await db.notification.count()).toBe(50);
  });

  it("два одновременных запуска не дублируют рассылку и не превышают лимит", async () => {
    await person(0, true);
    await person(1, true);
    await reserve(1);
    const results = await Promise.all([
      inviteReserveQueue(seasonId, now),
      inviteReserveQueue(seasonId, now),
    ]);
    expect(
      results.reduce((sum, item) => sum + (item.ok ? item.invited : 0), 0),
    ).toBe(1);
    expect(await db.notification.count()).toBe(1);
    expect(
      await db.assessmentInvite.count({ where: { reserveQueued: true } }),
    ).toBe(1);
  });

  it("выход из очереди снимает флаг, возвращение встаёт в конец; после исходного дня нельзя вернуться на него", async () => {
    const a = await person(0, true);
    const b = await person(1, true);
    expect(await answerInvite(a.userId, "GOING", now)).toMatchObject({
      ok: true,
    });
    expect(
      (await loadOverview(seasonId)).reserveQueue.map(
        (item) => item.applicationId,
      ),
    ).toEqual([b.applicationId]);
    await answerInvite(a.userId, "RESERVE", new Date(now.getTime() + 2000));
    expect(
      (await loadOverview(seasonId)).reserveQueue.map(
        (item) => item.applicationId,
      ),
    ).toEqual([b.applicationId, a.applicationId]);
    const later = new Date("2026-11-02T10:00:00Z");
    expect(
      (await loadCandidateAssessment(a.userId, later))!.invite!.canChange,
    ).toBe(true);
    expect(await answerInvite(a.userId, "GOING", later)).toMatchObject({
      ok: false,
    });
    expect(await answerInvite(a.userId, "CANT", later)).toMatchObject({
      ok: true,
    });
    expect((await loadOverview(seasonId)).reserveQueue).toHaveLength(1);
  });

  it("прежние назначения остаются и занимают места, эксперт не получает очередь", async () => {
    const a = await person();
    await db.assessmentInvite.update({
      where: { applicationId: a.applicationId },
      data: { answer: "RESERVE" },
    });
    await person(1, true);
    const id = await reserve(1);
    expect(await inviteReserveQueue(seasonId, now)).toMatchObject({
      ok: true,
      invited: 0,
      waiting: 1,
    });
    expect(
      (await loadCandidateAssessment(a.userId, now))!.invite!.day,
    ).toMatchObject({ reserve: true });
    expect((await loadOverview(seasonId, "expert")).reserveQueue).toEqual([]);
    expect(
      (await loadSessionPage(seasonId, id, true))!.unassigned,
    ).toHaveLength(1);
  });

  it("не приглашает в прошлое или на несообщённое место; очередь сохраняется", async () => {
    await person(0, true);
    const id = await reserve(50, "2026-10-24T09:00:00Z");
    expect(await inviteReserveQueue(seasonId, now)).toMatchObject({
      ok: false,
    });
    await db.assessmentSession.update({
      where: { id },
      data: {
        startsAt: new Date("2026-11-03T09:00:00Z"),
        invited: {
          building: "Старый",
          room: "100",
          startsAt: "2026-11-03T09:00:00.000Z",
          note: null,
        },
      },
    });
    expect(await inviteReserveQueue(seasonId, now)).toMatchObject({
      ok: false,
    });
    expect(
      await db.assessmentInvite.count({ where: { reserveQueued: true } }),
    ).toBe(1);
    expect(await notifyChange(seasonId, id)).toMatchObject({
      ok: true,
      sent: 0,
    });
    expect(await db.notification.count()).toBe(0);
  });

  it("пустая очередь и заблокированные пользователи не получают рассылку", async () => {
    const a = await person(0, true);
    await db.user.update({
      where: { id: a.userId },
      data: { status: "BLOCKED" },
    });
    await reserve();
    expect((await loadOverview(seasonId)).reserveQueue).toEqual([]);
    expect(await inviteReserveQueue(seasonId, now)).toMatchObject({
      ok: true,
      invited: 0,
    });
    expect(await db.notification.count()).toBe(0);
  });
});
