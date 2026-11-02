import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { beginBotDraft, botConversation, confirmBotDraft, fillBotDraft, getBotDraft, interviewBotActor, listBotSlots, loadBotSlot } from "./bot-staff";
import { botDay, parseBotDay, parseBotTime } from "./bot-rules";
import { interviewReminderIsCurrent } from "./reminders";
import { receiveFromTelegram } from "~~/lib/messages/bot-inbox";
import { telegramButton } from "~~/lib/notifications/telegram-sender";

const now = new Date("2026-11-02T09:00:00+03:00");
beforeEach(resetDatabase);
async function fixture() {
  const season = await db.season.create({ data: { slug: "bot", title: "S", year: 2026, isCurrent: true } });
  const role = await db.role.create({ data: { slug: "x", name: "Без привязки к названию", permissions: ["applications.review", "applications.view_all", "messages.reply"] } });
  const master = await db.user.create({ data: { firstName: "Мастер", telegramId: "10001", roles: { create: { roleId: role.id } } } });
  const other = await db.user.create({ data: { telegramId: "10002", roles: { create: { roleId: role.id } } } });
  const admin = await db.user.create({ data: { telegramId: "10003", isOwner: true } });
  const user = await db.user.create({ data: { telegramId: "10004" } });
  const app = await db.application.create({ data: { seasonId: season.id, userId: user.id, status: "SUBMITTED", firstName: "Участник", interviewReschedulesUsed: 1 } });
  const slot = await db.interviewSlot.create({ data: { seasonId: season.id, startsAt: new Date("2026-11-03T10:00:00+03:00"), endsAt: new Date("2026-11-03T10:45:00+03:00"), location: "Масловка", interviewers: { create: { userId: master.id } } } });
  const booking = await db.interviewBooking.create({ data: { applicationId: app.id, slotId: slot.id } });
  return { season, role, master, other, admin, user, app, slot, booking };
}
async function draft(tg: string, kind: "message" | "time" | "room", id: string, value: string) {
  await beginBotDraft(tg, kind, id, now);
  return (await fillBotDraft(tg, value, now))!;
}
describe("кабинет собеседований в боте", () => {
  it("строго понимает даты и московскую границу суток", () => {
    expect(botDay(new Date("2026-11-02T21:00:00Z"))).toBe("2026-11-03");
    expect(parseBotDay("31.02.2026")).toBeNull();
    expect(parseBotDay("03.11.2026")).toBe("2026-11-03");
    expect(parseBotTime("03.11.2026 24:00")).toBeNull();
    expect(parseBotTime("03.11.2026 17:25")?.toISOString()).toBe("2026-11-03T14:25:00.000Z");
  });
  it("мастер видит только свои записи; view_all не открывает чужие слоты", async () => {
    const f = await fixture();
    expect(await interviewBotActor("0")).toBeNull();
    expect((await listBotSlots("10001", "2026-11-03"))?.total).toBe(1);
    expect((await listBotSlots("10002", "2026-11-03"))?.total).toBe(0);
    expect(await loadBotSlot("10002", f.slot.id)).toBeNull();
    expect(await beginBotDraft("10002", "room", f.slot.id, now)).toBeNull();
    expect(await beginBotDraft("10001", "day", undefined, now)).toBeNull();
    expect((await listBotSlots("10003", "2026-11-03"))?.total).toBe(1);
    expect(await beginBotDraft("10003", "day", undefined, now)).not.toBeNull();
  });
  it("подтверждение отправляет сообщение ровно один раз с аудитом, историей и срочной доставкой", async () => {
    const f = await fixture(); const d = await draft("10001", "message", f.slot.id, "Жду у аудитории 205");
    expect(await db.message.count()).toBe(0);
    expect(await confirmBotDraft("10001", d.token, now)).toMatchObject({ ok: true });
    expect(await confirmBotDraft("10001", d.token, now)).toMatchObject({ ok: false });
    expect(await db.message.count({ where: { author: "STAFF", via: "TELEGRAM" } })).toBe(1);
    expect(await db.auditLog.count({ where: { actorId: f.master.id, action: "message.reply" } })).toBe(1);
    const note = await db.notification.findFirstOrThrow({ where: { userId: f.user.id }, include: { deliveries: true } });
    expect(note.body).toBe("Жду у аудитории 205"); expect(note.body).not.toContain("Мастер");
    expect(note.deliveries).toHaveLength(1); expect(note.deliveries[0]?.scheduledAt).toEqual(now);
    expect((await botConversation("10001", f.slot.id))?.[0]?.text).toBe("Жду у аудитории 205");
    expect(await botConversation("10002", f.slot.id)).toBeNull();
  });
  it("старый предпросмотр и чужой Telegram не подтверждают новый текст", async () => {
    const f = await fixture(); const first = await draft("10001", "message", f.slot.id, "Первый текст");
    const second = (await fillBotDraft("10001", "Второй текст", now))!;
    expect(second.token).not.toBe(first.token);
    expect(await confirmBotDraft("10001", first.token, now)).toMatchObject({ ok: false });
    expect(await confirmBotDraft("10002", second.token, now)).toMatchObject({ ok: false });
    expect(await confirmBotDraft("10001", second.token, now)).toMatchObject({ ok: true });
    expect((await db.message.findFirstOrThrow()).text).toBe("Второй текст");
  });
  it("отзыв прав, блокировка и истечение черновика не позволяют отправить", async () => {
    const f = await fixture(); const d = await draft("10001", "message", f.slot.id, "Текст");
    expect(await confirmBotDraft("10001", d.token, new Date(+now + 16 * 60_000))).toMatchObject({ ok: false });
    await db.user.update({ where: { id: f.master.id }, data: { status: "BLOCKED" } });
    expect(await confirmBotDraft("10001", d.token, now)).toMatchObject({ ok: false });
    await db.user.update({ where: { id: f.master.id }, data: { status: "ACTIVE" } });
    await db.role.update({ where: { id: f.role.id }, data: { permissions: ["applications.review"] } });
    expect(await confirmBotDraft("10001", d.token, now)).toMatchObject({ ok: false });
    expect(await db.message.count()).toBe(0);
  });
  it("изменившаяся запись и смена мастера делают черновик недействительным", async () => {
    const f = await fixture(); const d = await draft("10001", "message", f.slot.id, "Текст");
    await db.interviewBooking.update({ where: { id: f.booking.id }, data: { cancelledAt: now } });
    expect(await confirmBotDraft("10001", d.token, now)).toMatchObject({ ok: false });
    await db.slotInterviewer.update({ where: { slotId_userId: { slotId: f.slot.id, userId: f.master.id } }, data: { userId: f.other.id } });
    expect(await confirmBotDraft("10001", d.token, now)).toMatchObject({ ok: false });
    expect(await db.message.count()).toBe(0);
  });
  it("перенос проверяет 5 минут и сохраняет попытку; старые напоминания отменяются", async () => {
    const f = await fixture();
    await db.interviewSlot.create({ data: { seasonId: f.season.id, startsAt: new Date("2026-11-03T11:00:00+03:00"), endsAt: new Date("2026-11-03T11:45:00+03:00"), location: "Масловка", interviewers: { create: { userId: f.master.id } } } });
    const bad = await draft("10001", "time", f.slot.id, "2026-11-03T10:11:00+03:00");
    expect(await confirmBotDraft("10001", bad.token, now)).toMatchObject({ ok: false });
    const good = await draft("10001", "time", f.slot.id, "2026-11-03T10:10:00+03:00");
    expect(await confirmBotDraft("10001", good.token, now)).toMatchObject({ ok: true });
    const active = await db.interviewBooking.findFirstOrThrow({ where: { applicationId: f.app.id, cancelledAt: null }, include: { slot: true } });
    expect(active.id).not.toBe(f.booking.id);
    expect(+active.slot.endsAt - +active.slot.startsAt).toBe(45 * 60_000);
    expect((await db.application.findUniqueOrThrow({ where: { id: f.app.id } })).interviewReschedulesUsed).toBe(1);
    expect(await interviewReminderIsCurrent(`booking:${f.booking.id}:24h`, now)).toBe(false);
    expect(await db.notification.count()).toBe(2);
  });
  it("начавшаяся встреча сохраняется, аудитория меняется только до начала", async () => {
    const f = await fixture(); const at = new Date("2026-11-03T09:59:00+03:00");
    await beginBotDraft("10001", "room", f.slot.id, at);
    const d = (await fillBotDraft("10001", "205", at))!;
    expect(await confirmBotDraft("10001", d.token, new Date("2026-11-03T10:01:00+03:00"))).toMatchObject({ ok: false });
    expect(await getBotDraft("10001", now)).not.toBeNull();
    expect(await confirmBotDraft("10001", d.token, now)).toMatchObject({ ok: true });
    expect((await loadBotSlot("10001", f.slot.id))?.room).toBe("205");
  });
  it("ответ участника приходит ведущему с кнопкой карточки без сайта", async () => {
    const f = await fixture();
    await receiveFromTelegram({ id: "10004", firstName: "Участник" }, "Подскажите место встречи", now);
    const n = await db.notification.findFirstOrThrow({ where: { userId: f.master.id } });
    expect(n.body).toBe("Подскажите место встречи");
    expect(telegramButton(n, "https://school.example")?.inline_keyboard[0]?.[0]).toMatchObject({ callback_data: `iv:slot:${f.slot.id}` });
  });
});
