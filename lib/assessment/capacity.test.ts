import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { answerInvite } from "./candidate";
import {
  autoInvite,
  inviteReserveQueue,
  inviteSession,
  loadOverview,
  saveSession,
  type SessionInput,
} from "./sessions";

describe("лимит приглашений на слот ЦО", () => {
  let seasonId: string;
  let order: number;
  const now = new Date("2026-10-25T22:00:00.000Z");
  const base: SessionInput = {
    title: "Первый",
    building: "2",
    room: "305",
    startsAt: "2026-11-02T09:00:00.000Z",
    note: "",
    faculties: ["МЭО"],
    reserve: false,
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    await resetDatabase();
    seasonId = (
      await db.season.create({
        data: { slug: "capacity", title: "S", year: 2026, isCurrent: true },
      })
    ).id;
    await db.stage.create({
      data: { seasonId, kind: "ASSESSMENT", title: "ЦО", order: 3 },
    });
    order = 0;
  });
  afterEach(() => vi.useRealTimers());

  async function slot(extra: Partial<SessionInput> = {}) {
    const result = await saveSession(seasonId, { ...base, ...extra });
    if (!result.ok) throw new Error(result.message);
    return result.id;
  }

  async function applicants(count: number, faculty: string | null = "МЭО") {
    const users = await db.user.createManyAndReturn({
      data: Array.from({ length: count }, () => ({
        faculty,
        firstName: "Кандидат",
      })),
    });
    const data = users.map((user) => ({
      seasonId,
      userId: user.id,
      status: "SUBMITTED" as const,
      submittedAt: new Date(now.getTime() - 1_000_000 + order++ * 1000),
    }));
    return db.application.createManyAndReturn({
      data,
      select: { id: true, userId: true, submittedAt: true },
    });
  }

  it("по умолчанию 50 мест; неверный лимит отклоняется", async () => {
    const id = await slot();
    expect(
      (await db.assessmentSession.findUniqueOrThrow({ where: { id } }))
        .capacity,
    ).toBe(50);
    for (const capacity of [0, -1, 1.5, 10_001, Number.NaN]) {
      expect(
        await saveSession(seasonId, { ...base, id, capacity }),
      ).toMatchObject({ ok: false });
    }
  });

  it("ручная рассылка распределяет 66 анкет: первые 50 в первый слот, 16 во второй", async () => {
    const first = await slot();
    const second = await slot({
      title: "Второй",
      startsAt: "2026-11-02T11:00:00.000Z",
      room: "410",
    });
    const people = (await applicants(66)).sort(
      (a, b) => a.submittedAt!.getTime() - b.submittedAt!.getTime(),
    );
    expect(await inviteSession(seasonId, first)).toMatchObject({
      ok: true,
      invited: 66,
      overflow: 16,
      unplaced: 0,
    });
    const invites = await db.assessmentInvite.findMany();
    expect(
      invites
        .filter((item) => item.sessionId === first)
        .map((item) => item.applicationId)
        .sort(),
    ).toEqual(
      people
        .slice(0, 50)
        .map((item) => item.id)
        .sort(),
    );
    expect(invites.filter((item) => item.sessionId === second)).toHaveLength(
      16,
    );
    expect(await db.notification.count()).toBe(66);
    expect(
      (
        await db.notification.findFirstOrThrow({
          where: { userId: people[65]!.userId },
        })
      ).body,
    ).toContain("410");
    expect(
      (await db.assessmentSession.findUniqueOrThrow({ where: { id: second } }))
        .invitedAt,
    ).not.toBeNull();
    expect(await inviteSession(seasonId, first)).toMatchObject({
      ok: true,
      invited: 0,
      skipped: 66,
    });
  });

  it("после первых 50 автоприглашения идут в созданный второй слот, прежние не переносятся", async () => {
    const first = await slot();
    const initial = await applicants(50);
    await inviteSession(seasonId, first);
    const before = await db.assessmentInvite.findMany({
      where: { sessionId: first },
      orderBy: { id: "asc" },
    });
    const second = await slot({
      title: "Второй",
      startsAt: "2026-11-02T11:00:00.000Z",
    });
    const late = await applicants(16);
    for (const person of late) expect(await autoInvite(person.id)).toBe(true);
    expect(
      await db.assessmentInvite.count({ where: { sessionId: first } }),
    ).toBe(50);
    expect(
      await db.assessmentInvite.count({ where: { sessionId: second } }),
    ).toBe(16);
    expect(
      await db.assessmentInvite.findMany({
        where: { applicationId: { in: initial.map((item) => item.id) } },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    expect(
      (await loadOverview(seasonId)).sessions.map((item) => [
        item.occupied,
        item.capacity,
      ]),
    ).toEqual([
      [50, 50],
      [16, 50],
    ]);
  });

  it("без следующего подходящего слота кандидат остаётся без приглашения", async () => {
    const first = await slot({ capacity: 1 });
    await applicants(1);
    await inviteSession(seasonId, first);
    await slot({ reserve: true, title: "Резерв" });
    await slot({
      title: "Чужой факультет",
      faculties: ["ЮФ"],
      startsAt: "2026-11-02T11:00:00.000Z",
    });
    await slot({ title: "В прошлом", startsAt: "2026-10-24T09:00:00.000Z" });
    const [late] = await applicants(1);
    expect(await autoInvite(late!.id)).toBe(false);
    expect(await inviteSession(seasonId, first, [late!.id])).toMatchObject({
      ok: true,
      invited: 0,
      unplaced: 1,
    });
    expect(
      await db.assessmentInvite.findUnique({
        where: { applicationId: late!.id },
      }),
    ).toBeNull();
    expect(
      await db.notification.count({ where: { userId: late!.userId } }),
    ).toBe(0);
    const next = await slot({
      title: "Подходящий",
      startsAt: "2026-11-02T12:00:00.000Z",
    });
    expect(await autoInvite(late!.id)).toBe(true);
    expect(
      (
        await db.assessmentInvite.findUniqueOrThrow({
          where: { applicationId: late!.id },
        })
      ).sessionId,
    ).toBe(next);
  });

  it("отказ и ответ «резервный день» не освобождают места исходного слота", async () => {
    const first = await slot({ capacity: 2 });
    const original = await applicants(2);
    await inviteSession(seasonId, first);
    await db.assessmentInvite.update({
      where: { applicationId: original[0]!.id },
      data: { answer: "CANT" },
    });
    await db.assessmentInvite.update({
      where: { applicationId: original[1]!.id },
      data: { answer: "RESERVE" },
    });
    const next = await slot({
      title: "Второй",
      startsAt: "2026-11-02T11:00:00.000Z",
    });
    const [late] = await applicants(1);
    expect(await autoInvite(late!.id)).toBe(true);
    expect(
      (
        await db.assessmentInvite.findUniqueOrThrow({
          where: { applicationId: late!.id },
        })
      ).sessionId,
    ).toBe(next);
    expect((await loadOverview(seasonId)).sessions[0]!.occupied).toBe(2);
  });

  it("одновременная ручная и автоматическая рассылка не превышают лимит", async () => {
    const first = await slot({ capacity: 2 });
    const [initial] = await applicants(1);
    await inviteSession(seasonId, first, [initial!.id]);
    const second = await slot({
      title: "Второй",
      capacity: 1,
      startsAt: "2026-11-02T11:00:00.000Z",
    });
    const [a, b] = await applicants(2);
    await Promise.all([
      inviteSession(seasonId, first, [a!.id]),
      autoInvite(b!.id),
    ]);
    expect(
      await db.assessmentInvite.count({ where: { sessionId: first } }),
    ).toBe(2);
    expect(
      await db.assessmentInvite.count({ where: { sessionId: second } }),
    ).toBe(1);
    expect(await db.notification.count()).toBe(3);
  });

  it("несколько одновременных кандидатов занимают последнее место только один раз", async () => {
    const first = await slot({ capacity: 2 });
    await applicants(1);
    await inviteSession(seasonId, first);
    const late = await applicants(3);
    const results = await Promise.all(
      late.map((person) => autoInvite(person.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await db.assessmentInvite.count({ where: { sessionId: first } }),
    ).toBe(2);
    expect(await db.notification.count()).toBe(2);
  });

  it("не позволяет уменьшить лимит ниже приглашённых и сохраняет лимит при правке других полей", async () => {
    const id = await slot({ capacity: 2 });
    await applicants(2);
    await inviteSession(seasonId, id);
    expect(
      await saveSession(seasonId, { ...base, id, capacity: 1 }),
    ).toMatchObject({ ok: false });
    expect(
      await saveSession(seasonId, { ...base, id, title: "Новое название" }),
    ).toMatchObject({ ok: true });
    expect(
      (await db.assessmentSession.findUniqueOrThrow({ where: { id } }))
        .capacity,
    ).toBe(2);
  });

  it("резервный слот учитывает переходы и не переполняется одновременно с ручным приглашением", async () => {
    const first = await slot();
    const [a, b] = await applicants(2);
    await inviteSession(seasonId, first);
    const reserve = await slot({ title: "Резерв", reserve: true, capacity: 1 });
    const results = await Promise.all([
      answerInvite(a!.userId, "RESERVE", now),
      answerInvite(b!.userId, "RESERVE", now),
    ]);
    expect(results.filter((item) => item.ok)).toHaveLength(2);
    const [late] = await applicants(1);
    const sent = await Promise.all([
      inviteReserveQueue(seasonId, now),
      inviteSession(seasonId, reserve, [late!.id]),
    ]);
    expect(sent.every((item) => item.ok)).toBe(true);
    expect(
      (await loadOverview(seasonId)).sessions.find(
        (item) => item.id === reserve,
      ),
    ).toMatchObject({ occupied: 1, capacity: 1 });
  });

  it("при пересоздании резервного слота его лимит учитывает прежние ответы «резервный день»", async () => {
    const first = await slot();
    await applicants(2);
    await inviteSession(seasonId, first);
    await db.assessmentInvite.updateMany({
      where: { sessionId: first },
      data: { answer: "RESERVE" },
    });
    expect(
      await saveSession(seasonId, {
        ...base,
        title: "Резерв",
        reserve: true,
        capacity: 1,
      }),
    ).toMatchObject({ ok: false });
    const reserve = await slot({ title: "Резерв", reserve: true, capacity: 2 });
    expect(
      (await loadOverview(seasonId)).sessions.find(
        (item) => item.id === reserve,
      ),
    ).toMatchObject({ occupied: 2, capacity: 2 });
  });
});
