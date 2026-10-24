import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { book, cancel, setSlotInterviewers } from "./booking";
import { dueReminders, materializeReminders } from "./reminders";
import { createSlots, cutSlots } from "./slots";

const msk = (iso: string) => new Date(`${iso}+03:00`);
const NOW = msk("2026-10-15T12:00:00");

describe("cutSlots", () => {
  it("10:00–12:00 по 20 минут с перерывом 10 — четыре слота", () => {
    const slots = cutSlots({ date: "2026-10-20", from: "10:00", to: "12:00", duration: 20, gap: 10 });
    expect(slots.map((slot) => slot.startsAt)).toEqual([
      msk("2026-10-20T10:00:00"),
      msk("2026-10-20T10:30:00"),
      msk("2026-10-20T11:00:00"),
      msk("2026-10-20T11:30:00"),
    ]);
    expect(slots[0]?.endsAt).toEqual(msk("2026-10-20T10:20:00"));
  });

  it("бессмысленные параметры — ничего", () => {
    expect(cutSlots({ date: "2026-10-20", from: "12:00", to: "10:00", duration: 20, gap: 0 })).toEqual([]);
    expect(cutSlots({ date: "2026-10-20", from: "10:00", to: "12:00", duration: 0, gap: 0 })).toEqual([]);
  });
});

describe("dueReminders", () => {
  it("за сутки и за час, прошедшие — нет", () => {
    const bookings = [
      { id: "a", startsAt: msk("2026-10-16T11:00:00") }, // через 23 часа
      { id: "b", startsAt: msk("2026-10-15T12:40:00") }, // через 40 минут
      { id: "c", startsAt: msk("2026-10-17T12:00:00") }, // через двое суток
      { id: "d", startsAt: msk("2026-10-15T11:00:00") }, // уже было
    ];
    expect(dueReminders(bookings, NOW)).toEqual([
      { bookingId: "a", kind: "24h" },
      { bookingId: "b", kind: "24h" },
      { bookingId: "b", kind: "1h" },
    ]);
  });
});

describe("запись на собеседование", () => {
  let seasonId: string;
  let katya: { id: string };
  let ilya: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    await db.stage.create({ data: { seasonId, kind: "INTERVIEW", title: "Собес", order: 3, mode: "OPEN" } });
    katya = await db.user.create({ data: { firstName: "Катя" } });
    ilya = await db.user.create({ data: { firstName: "Илья" } });
  });

  // Отсева между этапами нет: записаться может каждый, кто отправил анкету.
  async function candidate(name: string, submitted: boolean) {
    const user = await db.user.create({ data: { firstName: name } });
    const application = await db.application.create({
      data: { seasonId, userId: user.id, status: submitted ? "SUBMITTED" : "DRAFT", lastName: name, firstName: "И" },
    });
    return { user, application };
  }

  async function slot(startIso: string, interviewers: string[], capacity = 1) {
    const created = await createSlots({
      seasonId,
      slots: [{ startsAt: msk(startIso), endsAt: new Date(msk(startIso).getTime() + 20 * 60_000) }],
      location: "Ауд. 301",
      capacity,
      interviewerIds: interviewers,
      createdById: null,
    });
    return created[0]!;
  }

  it("без отправленной анкеты записаться нельзя", async () => {
    const { user } = await candidate("Алина", false);
    const s = await slot("2026-10-20T10:00:00", [katya.id]);
    expect(await book(user.id, s.id, NOW)).toMatchObject({ ok: false });
  });

  it("запись создаёт оценку каждому собеседующему", async () => {
    const { user, application } = await candidate("Алина", true);
    const s = await slot("2026-10-20T10:00:00", [katya.id, ilya.id]);

    expect(await book(user.id, s.id, NOW)).toMatchObject({ ok: true });
    const reviewers = await db.review.findMany({ where: { applicationId: application.id, stageKind: "INTERVIEW" } });
    expect(reviewers.map((review) => review.reviewerId).sort()).toEqual([katya.id, ilya.id].sort());
  });

  it("собеседующих слота можно поменять: новым — оценка, начатая у снятого остаётся", async () => {
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: ["applications.review"] } });
    const olya = await db.user.create({ data: { firstName: "Оля", roles: { create: { roleId: role.id } } } });
    await db.userRole.createMany({ data: [katya.id, ilya.id].map((userId) => ({ userId, roleId: role.id })) });
    const { user, application } = await candidate("Алина", true);
    const s = await slot("2026-10-20T10:00:00", [katya.id, ilya.id]);
    await book(user.id, s.id, NOW);
    await db.review.updateMany({ where: { applicationId: application.id, reviewerId: katya.id }, data: { comment: "Начала" } });

    expect(await setSlotInterviewers(s.id, [olya.id])).toMatchObject({ ok: true, added: [olya.id] });
    const reviewers = (await db.review.findMany({ where: { applicationId: application.id, stageKind: "INTERVIEW" } })).map((r) => r.reviewerId);
    // Илья (пусто) снят, Катя (начала) осталась, Оля добавлена.
    expect(reviewers.sort()).toEqual([katya.id, olya.id].sort());
    expect((await db.slotInterviewer.findMany({ where: { slotId: s.id } })).map((i) => i.userId)).toEqual([olya.id]);

    const stranger = await db.user.create({ data: { firstName: "Кандидат" } });
    expect(await setSlotInterviewers(s.id, [stranger.id])).toMatchObject({ ok: false });
  });

  it("занятый слот второму не даётся, даже одновременно", async () => {
    const a = await candidate("Алина", true);
    const b = await candidate("Борис", true);
    const s = await slot("2026-10-20T10:00:00", [katya.id]);

    const results = await Promise.all([book(a.user.id, s.id, NOW), book(b.user.id, s.id, NOW)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.interviewBooking.count({ where: { cancelledAt: null } })).toBe(1);
  });

  it("новая запись переносит старую; пустые оценки прежних собеседующих удаляются", async () => {
    const { user, application } = await candidate("Алина", true);
    const first = await slot("2026-10-20T10:00:00", [katya.id]);
    const second = await slot("2026-10-21T10:00:00", [ilya.id]);

    await book(user.id, first.id, NOW);
    expect(await book(user.id, second.id, NOW)).toMatchObject({ ok: true });

    expect(await db.interviewBooking.count({ where: { applicationId: application.id, cancelledAt: null } })).toBe(1);
    const reviews = await db.review.findMany({ where: { applicationId: application.id, stageKind: "INTERVIEW" } });
    expect(reviews.map((review) => review.reviewerId)).toEqual([ilya.id]);
  });

  it("перенести и отменить меньше чем за 12 часов нельзя", async () => {
    const { user } = await candidate("Алина", true);
    const soon = await slot("2026-10-15T20:00:00", [katya.id]);
    const later = await slot("2026-10-20T10:00:00", [katya.id]);

    expect(await book(user.id, soon.id, NOW)).toMatchObject({ ok: true });
    expect(await book(user.id, later.id, NOW)).toMatchObject({ ok: false });
    expect(await cancel(user.id, NOW)).toMatchObject({ ok: false });
  });

  it("записаться позже чем за 2 часа до начала нельзя", async () => {
    const { user } = await candidate("Алина", true);
    const s = await slot("2026-10-15T13:30:00", [katya.id]);
    expect(await book(user.id, s.id, NOW)).toMatchObject({ ok: false });
  });

  it("отмена освобождает слот", async () => {
    const a = await candidate("Алина", true);
    const b = await candidate("Борис", true);
    const s = await slot("2026-10-20T10:00:00", [katya.id]);
    await book(a.user.id, s.id, NOW);

    expect(await cancel(a.user.id, NOW)).toMatchObject({ ok: true });
    expect(await book(b.user.id, s.id, NOW)).toMatchObject({ ok: true });
  });

  it("напоминания создаются по одному разу", async () => {
    const { user } = await candidate("Алина", true);
    const s = await slot("2026-10-15T20:00:00", [katya.id]);
    await book(user.id, s.id, NOW);

    await materializeReminders(NOW);
    await materializeReminders(NOW);
    const reminders = await db.notification.findMany({ where: { userId: user.id, key: { contains: ":24h" } } });
    expect(reminders).toHaveLength(1);
  });
});
