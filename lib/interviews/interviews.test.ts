import { beforeEach, describe, expect, it, vi } from "vitest";

import * as audit from "~~/lib/audit";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { changeDeadline } from "./rules";
import { manageBooking, updateRoom } from "./manage";
import { book, cancel, loadInterview, setSlotInterviewers } from "./booking";
import { dueReminders, materializeReminders, interviewReminderIsCurrent } from "./reminders";
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
    const role = await db.role.create({ data: { name: "Мастер", slug: "interview-master", permissions: ["applications.review"] } });
    katya = await db.user.create({ data: { firstName: "Катя", roles: { create: { roleId: role.id } } } });
    ilya = await db.user.create({ data: { firstName: "Илья", roles: { create: { roleId: role.id } } } });
  });

  // По умолчанию кандидат прошёл ЦО; отдельные тесты ниже снимают явку.
  async function candidate(name: string, submitted: boolean) {
    const user = await db.user.create({ data: { firstName: name } });
    const application = await db.application.create({
      data: { seasonId, userId: user.id, status: submitted ? "SUBMITTED" : "DRAFT", lastName: name, firstName: "И" },
    });
    const session = await db.assessmentSession.create({ data: { seasonId, title: "ЦО", startsAt: msk("2026-10-01T10:00:00") } });
    await db.assessmentInvite.create({ data: { applicationId: application.id, sessionId: session.id, attended: true } });
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

  it("запись создаёт оценку единственному мастеру", async () => {
    const { user, application } = await candidate("Алина", true);
    const s = await slot("2026-10-20T10:00:00", [katya.id]);

    expect(await book(user.id, s.id, NOW)).toMatchObject({ ok: true });
    const reviewers = await db.review.findMany({ where: { applicationId: application.id, stageKind: "INTERVIEW" } });
    expect(reviewers.map((review) => review.reviewerId).sort()).toEqual([katya.id]);
  });

  it("собеседующих слота можно поменять: новым — оценка, начатая у снятого остаётся", async () => {
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: ["applications.review"] } });
    const olya = await db.user.create({ data: { firstName: "Оля", roles: { create: { roleId: role.id } } } });
    await db.userRole.createMany({ data: [katya.id, ilya.id].map((userId) => ({ userId, roleId: role.id })) });
    const { user, application } = await candidate("Алина", true);
    const s = await slot("2026-10-20T10:00:00", [katya.id]);
    await book(user.id, s.id, NOW);
    await db.review.updateMany({ where: { applicationId: application.id, reviewerId: katya.id }, data: { comment: "Начала" } });

    expect(await setSlotInterviewers(s.id, [olya.id])).toMatchObject({ ok: true, added: [olya.id] });
    const reviewers = (await db.review.findMany({ where: { applicationId: application.id, stageKind: "INTERVIEW" } })).map((r) => r.reviewerId);
    // Катя начала оценку: она остаётся, Оля добавлена.
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

  it("перенести в день собеседования нельзя; самостоятельная отмена не обходит лимит", async () => {
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

  it("ручная отмена освобождает слот", async () => {
    const a = await candidate("Алина", true);
    const b = await candidate("Борис", true);
    const s = await slot("2026-10-20T10:00:00", [katya.id]);
    await book(a.user.id, s.id, NOW);

    const owner = await db.user.create({ data: { isOwner: true } });
    expect(await cancel(a.user.id, NOW)).toMatchObject({ ok: false });
    expect(await manageBooking({ actorId: owner.id, seasonId, applicationId: a.application.id, slotId: null, restoreChange: false }, {}, NOW)).toMatchObject({ ok: true });
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
  it("ровно одна перезапись; конкурентные переносы не обходят лимит", async () => {
    const { user, application } = await candidate("Алина", true);
    const first = await slot("2026-11-04T10:00:00", [katya.id]);
    const second = await slot("2026-11-05T10:00:00", [katya.id]);
    const third = await slot("2026-11-06T10:00:00", [katya.id]);
    await book(user.id, first.id, NOW);
    const results = await Promise.all([book(user.id, second.id, NOW), book(user.id, third.id, NOW)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect((await db.application.findUniqueOrThrow({ where: { id: application.id } })).interviewReschedulesUsed).toBe(1);
    const current = await db.interviewBooking.findFirstOrThrow({ where: { applicationId: application.id, cancelledAt: null } });
    expect(await book(user.id, current.slotId, NOW)).toMatchObject({ ok: true });
    expect((await loadInterview(user.id, NOW))?.booking?.canChange).toBe(false);
    expect((await loadInterview(user.id, NOW))?.slots).toHaveLength(0);
  });

  it("18:00 предыдущего дня включительно; в 18:00:01 перенос запрещён", async () => {
    const at = msk("2026-11-04T18:00:00");
    const first = await slot("2026-11-05T23:00:00", [katya.id]);
    const next = await slot("2026-11-06T10:00:00", [katya.id]);
    expect(changeDeadline(msk("2026-11-05T23:00:00"))).toEqual(at);
    const a = await candidate("А", true);
    await book(a.user.id, first.id, NOW);
    expect(await book(a.user.id, next.id, new Date(at.getTime() + 1000))).toMatchObject({ ok: false });
    expect(await book(a.user.id, next.id, at)).toMatchObject({ ok: true });
  });

  it("новое время также должно допускать перенос; занятое не расходует попытку", async () => {
    const a = await candidate("А", true);
    const b = await candidate("Б", true);
    const first = await slot("2026-11-07T10:00:00", [katya.id]);
    const next = await slot("2026-11-06T10:00:00", [katya.id]);
    await book(a.user.id, first.id, NOW);
    await book(b.user.id, next.id, NOW);
    expect(await book(a.user.id, next.id, NOW)).toMatchObject({ ok: false });
    expect((await db.application.findUniqueOrThrow({ where: { id: a.application.id } })).interviewReschedulesUsed).toBe(0);
    expect(await book(a.user.id, next.id, msk("2026-11-05T18:00:01"))).toMatchObject({ ok: false });
  });

  it("пересечения мастера запрещены, параллельное время разных мастеров разрешено", async () => {
    await slot("2026-11-02T10:00:00", [katya.id]);
    await expect(slot("2026-11-02T10:10:00", [katya.id])).rejects.toThrow(/уже есть собеседование/);
    await expect(slot("2026-11-02T10:00:00", [ilya.id])).resolves.toHaveProperty("id");
    await expect(slot("2026-11-02T11:00:00", [katya.id, ilya.id])).rejects.toThrow(/ровно один/);
  });

  it("аудитория: только свой мастер/организатор, уведомление срочное и аудит; повтор не дублирует", async () => {
    const a = await candidate("А", true);
    const s = await slot("2026-11-05T10:00:00", [katya.id]);
    await book(a.user.id, s.id, NOW);
    expect(await updateRoom(ilya.id, seasonId, s.id, "602")).toMatchObject({ ok: false });
    expect(await updateRoom(a.user.id, seasonId, s.id, "602")).toMatchObject({ ok: false });
    expect(await updateRoom(katya.id, seasonId, s.id, "602")).toMatchObject({ ok: true });
    expect(await updateRoom(katya.id, seasonId, s.id, "602")).toMatchObject({ ok: true });
    const notifications = await db.notification.findMany({ where: { userId: a.user.id, title: "Уточнена аудитория собеседования" } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toContain("602");
    expect(await db.auditLog.count({ where: { action: "interview.room_update" } })).toBe(1);
    expect((await loadInterview(a.user.id, NOW))?.booking?.room).toBe("602");
  });

  it("организатор переносит вне дедлайна и явно восстанавливает попытку, мастер не может", async () => {
    const a = await candidate("А", true);
    const owner = await db.user.create({ data: { isOwner: true } });
    const first = await slot("2026-11-03T10:00:00", [katya.id]);
    const second = await slot("2026-11-04T10:00:00", [katya.id]);
    const third = await slot("2026-11-06T10:00:00", [katya.id]);
    await book(a.user.id, first.id, NOW);
    await book(a.user.id, second.id, NOW);
    const params = { actorId: owner.id, seasonId, applicationId: a.application.id, slotId: third.id, restoreChange: true };
    expect(await manageBooking({ ...params, actorId: ilya.id }, {}, msk("2026-11-04T09:00:00"))).toMatchObject({ ok: false });
    expect(await manageBooking(params, {}, msk("2026-11-04T09:00:00"))).toMatchObject({ ok: true });
    expect((await db.application.findUniqueOrThrow({ where: { id: a.application.id } })).interviewReschedulesUsed).toBe(0);
    expect(await db.auditLog.count({ where: { action: "interview.booking_manage" } })).toBe(1);
  });

  it("напоминание дедлайна: с 16 до 18 накануне, не после; использовавшим перенос не приходит", async () => {
    const a = await candidate("А", true);
    const s = await slot("2026-11-05T23:30:00", [katya.id]);
    await book(a.user.id, s.id, NOW);
    const count = () => db.notification.count({ where: { userId: a.user.id, key: { endsWith: ":change-deadline" } } });
    await materializeReminders(msk("2026-11-04T15:59:59")); expect(await count()).toBe(0);
    await materializeReminders(msk("2026-11-04T16:00:00"));
    await materializeReminders(msk("2026-11-04T17:00:00")); expect(await count()).toBe(1);
    await materializeReminders(msk("2026-11-04T18:00:00")); expect(await count()).toBe(1);
    await db.notification.deleteMany({ where: { userId: a.user.id } });
    await db.application.update({ where: { id: a.application.id }, data: { interviewReschedulesUsed: 1 } });
    await materializeReminders(msk("2026-11-04T16:01:00")); expect(await count()).toBe(0);
  });

  it("создание пересекающихся слотов одного мастера одновременно: только один", async () => {
    const results = await Promise.allSettled([slot("2026-11-02T10:00:00", [katya.id]), slot("2026-11-02T10:00:00", [katya.id])]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.interviewSlot.count()).toBe(1);
  });

  it("ошибка аудита откатывает аудиторию; уведомление не создаётся", async () => {
    const s = await slot("2026-11-02T10:00:00", [katya.id]);
    const spy = vi.spyOn(audit, "writeAudit").mockRejectedValueOnce(new Error("audit unavailable"));
    try { await expect(updateRoom(katya.id, seasonId, s.id, "602")).rejects.toThrow("audit unavailable"); }
    finally { spy.mockRestore(); }
    expect((await db.interviewSlot.findUniqueOrThrow({ where: { id: s.id } })).room).toBeNull();
    expect(await db.notification.count({ where: { title: "Уточнена аудитория собеседования" } })).toBe(0);
  });

  it("отмена и истёкший дедлайн делают доставку неактуальной; отмена не предлагает новую запись", async () => {
    const a = await candidate("А", true);
    const s = await slot("2026-11-05T10:00:00", [katya.id]);
    await book(a.user.id, s.id, NOW);
    const booking = await db.interviewBooking.findFirstOrThrow({ where: { applicationId: a.application.id } });
    const key = `booking:${booking.id}:change-deadline`;
    expect(await interviewReminderIsCurrent(key, msk("2026-11-04T16:00:00"))).toBe(true);
    expect(await interviewReminderIsCurrent(key, msk("2026-11-04T18:00:00"))).toBe(false);
    await db.interviewBooking.update({ where: { id: booking.id }, data: { cancelledAt: NOW } });
    expect(await interviewReminderIsCurrent(key, msk("2026-11-04T16:00:00"))).toBe(false);
    expect((await loadInterview(a.user.id, NOW))?.bookingCancelled).toBe(true);
    expect((await loadInterview(a.user.id, NOW))?.slots).toHaveLength(0);
    expect(await book(a.user.id, s.id, NOW)).toMatchObject({ ok: false });
  });

  it("без явки нельзя записаться ни кандидату, ни через ручное назначение; ручная явка допускает без ответа", async () => {
    const a = await candidate("А", true);
    const owner = await db.user.create({ data: { isOwner: true } });
    const s = await slot("2026-11-05T10:00:00", [katya.id]);
    await db.assessmentInvite.update({ where: { applicationId: a.application.id }, data: { attended: false, answer: "RESERVE", reserveQueued: true } });
    expect((await loadInterview(a.user.id, NOW))?.allowed).toBe(false);
    expect((await loadInterview(a.user.id, NOW))?.slots).toHaveLength(0);
    expect(await book(a.user.id, s.id, NOW)).toMatchObject({ ok: false });
    expect(await manageBooking({ actorId: owner.id, seasonId, applicationId: a.application.id, slotId: s.id, restoreChange: false }, {}, NOW)).toMatchObject({ ok: false });
    expect(await db.interviewBooking.count()).toBe(0);
    await db.assessmentInvite.update({ where: { applicationId: a.application.id }, data: { attended: true, answer: null, reserveQueued: false } });
    expect((await loadInterview(a.user.id, NOW))?.allowed).toBe(true);
    expect(await book(a.user.id, s.id, NOW)).toMatchObject({ ok: true });
  });

  it("снятая явка блокирует перенос, но не отменяет текущую запись; без приглашения допуск закрыт", async () => {
    const a = await candidate("А", true);
    const first = await slot("2026-11-05T10:00:00", [katya.id]);
    const next = await slot("2026-11-06T10:00:00", [katya.id]);
    await book(a.user.id, first.id, NOW);
    await db.assessmentInvite.update({ where: { applicationId: a.application.id }, data: { attended: false } });
    const view = await loadInterview(a.user.id, NOW);
    expect(view?.allowed).toBe(false); expect(view?.booking?.slotId).toBe(first.id); expect(view?.booking?.canChange).toBe(false);
    expect(await book(a.user.id, next.id, NOW)).toMatchObject({ ok: false });
    expect(await db.interviewBooking.count({ where: { applicationId: a.application.id, cancelledAt: null } })).toBe(1);
    const b = await candidate("Б", true);
    await db.assessmentInvite.delete({ where: { applicationId: b.application.id } });
    expect(await book(b.user.id, next.id, NOW)).toMatchObject({ ok: false });
  });

});
