import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { createBot } from "./main";
import { botDay } from "~~/lib/interviews/bot-rules";

beforeEach(resetDatabase);
async function setup() {
  const season = await db.season.create({ data: { slug: "bot", title: "S", year: 2026, isCurrent: true } });
  const role = await db.role.create({ data: { slug: "r", name: "R", permissions: ["applications.review", "applications.view_all", "messages.reply"] } });
  const master = await db.user.create({ data: { telegramId: "11", roles: { create: { roleId: role.id } } } });
  const user = await db.user.create({ data: { telegramId: "12" } });
  const application = await db.application.create({ data: { seasonId: season.id, userId: user.id, status: "SUBMITTED", firstName: "Тестовый", lastName: "Участник" } });
  const slot = await db.interviewSlot.create({ data: { seasonId: season.id, startsAt: new Date(`${botDay(new Date(), 1)}T10:00:00+03:00`), endsAt: new Date(`${botDay(new Date(), 1)}T10:45:00+03:00`), location: "Рязанка", interviewers: { create: { userId: master.id } }, bookings: { create: { applicationId: application.id } } } });
  const bot = createBot("123456:test-local-no-network");
  bot.botInfo = { id: 99, is_bot: true, first_name: "Bot", username: "test_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  let missingPanel = false;
  bot.api.config.use(async (previous, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "editMessageText" && missingPanel) {
      missingPanel = false;
      return { ok: false, error_code: 400, description: "Bad Request: message to edit not found" } as Awaited<ReturnType<typeof previous>>;
    }
    return { ok: true, result: method === "answerCallbackQuery" || method === "deleteMessage" ? true : { message_id: 1000 + calls.length, date: 1, chat: { id: 11, type: "private" }, text: "" } } as Awaited<ReturnType<typeof previous>>;
  });
  let serial = 0;
  async function text(text: string, chatType: "private" | "group" = "private", from = 11) {
    await bot.handleUpdate({ update_id: ++serial, message: { message_id: serial, date: 1, from: { id: from, is_bot: false, first_name: "Тест" }, chat: chatType === "private" ? { id: from, type: "private", first_name: "Тест" } : { id: -1, type: "group", title: "Группа" }, text, ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] } : {}) } });
  }
  async function click(data: string, from = 11) {
    await bot.handleUpdate({ update_id: ++serial, callback_query: { id: String(serial), from: { id: from, is_bot: false, first_name: "Тест" }, chat_instance: "x", data, message: { message_id: 1, date: 1, chat: { id: from, type: "private", first_name: "Тест" }, text: "Меню" } } });
  }
  const lastView = () => calls.filter(c => c.method === "sendMessage" || c.method === "editMessageText").at(-1);
  return { bot, calls, text, click, slot, master, lastView, removePanel: () => { missingPanel = true; } };
}
describe("реальные обработчики команд бота без сети", () => {
  it("!помощь и /tomorrow открывают inline-меню, группа не получает расписание", async () => {
    const f = await setup();
    await f.text("!помощь");
    expect(f.lastView()?.payload.text).toContain("Мои собеседования");
    expect(JSON.stringify(f.lastView()?.payload.reply_markup)).toContain("iv:list:");
    await f.text("/tomorrow");
    expect(JSON.stringify(f.lastView()?.payload.reply_markup)).toContain(`iv:slot:${f.slot.id}`);
    const count = f.calls.length;
    await f.text("/today", "group");
    expect(f.calls).toHaveLength(count);
  });
  it("карточка → черновик → подтверждение; текст без выбора не отправляется участнику", async () => {
    const f = await setup();
    await f.text("Привет"); expect(await db.message.count()).toBe(0);
    await f.click(`iv:slot:${f.slot.id}`);
    expect(f.lastView()?.payload.text).toContain("Тестовый");
    await f.click(`iv:message:${f.slot.id}`);
    await f.text("Жду на первом этаже");
    expect(await db.message.count()).toBe(0);
    const keyboard = f.lastView()?.payload.reply_markup as { inline_keyboard: { callback_data: string }[][] };
    const confirm = keyboard.inline_keyboard[0]![0]!.callback_data;
    await f.click(confirm); await f.click(confirm);
    expect(await db.message.count({ where: { author: "STAFF" } })).toBe(1);
    expect(await db.notification.count({ where: { title: "Сообщение от Школы Актива" } })).toBe(1);
  });
  it("/start отменяет режим ввода; кандидат не может воспользоваться кнопкой мастера", async () => {
    const f = await setup();
    await f.click(`iv:message:${f.slot.id}`);
    await f.text("/cancel");
    await f.text("Отменённый текст"); expect(await db.message.count()).toBe(0);
    await f.click(`iv:message:${f.slot.id}`);
    await f.text("/start");
    await f.text("Не отправлять"); expect(await db.message.count()).toBe(0);
    await f.click(`iv:slot:${f.slot.id}`, 12);
    expect(f.lastView()?.payload.text).not.toContain("Тестовый");
  });
  it("переходы и оценки обновляют одно сообщение, обработанный ввод удаляется", async () => {
    const f = await setup();
    await f.text("!помощь");
    await f.click(`iv:slot:${f.slot.id}`);
    expect(JSON.stringify(f.lastView()?.payload.reply_markup)).toContain("iv:reviews:");
    await f.click(`iv:reviews:${f.slot.id}:0`);
    expect(f.lastView()?.payload.text).toContain("Предыдущие оценки");
    await f.click(`iv:slot:${f.slot.id}`);
    expect(f.calls.filter(c => c.method === "sendMessage")).toHaveLength(1);
    expect(f.calls.filter(c => c.method === "editMessageText")).toHaveLength(3);
    expect(f.calls.filter(c => c.method === "deleteMessage")).toHaveLength(1);
    expect(await db.settings.count({ where: { id: `bot-interview-panel:${f.master.id}` } })).toBe(1);
  });
  it("восстанавливает удалённую панель и удаляет старую", async () => {
    const f = await setup();
    await f.text("!помощь");
    f.removePanel();
    await f.click(`iv:slot:${f.slot.id}`);
    expect(f.calls.filter(c => c.method === "sendMessage")).toHaveLength(2);
    expect(f.calls.filter(c => c.method === "deleteMessage")).toHaveLength(2);
    const saved = await db.settings.findUniqueOrThrow({ where: { id: `bot-interview-panel:${f.master.id}` } });
    expect(saved.data).toMatchObject({ chatId: 11, messageId: expect.any(Number) });
  });
  it("!выгрузка отправляет Excel только админу в личный чат и пишет журнал", async () => {
    const f = await setup();
    const admin = await db.user.create({ data: { telegramId: "13", isOwner: true } });
    await f.text("!выгрузка", "group", 13);
    await f.text("!выгрузка");
    await f.text("!выгрузка", "private", 12);
    expect(f.calls.filter(c => c.method === "sendDocument")).toHaveLength(0);
    expect(await db.message.count()).toBe(0);
    await f.text("!выгрузка", "private", 13);
    const documents = f.calls.filter(c => c.method === "sendDocument");
    expect(documents).toHaveLength(1);
    expect(documents[0]?.payload.chat_id).toBe(13);
    expect(documents[0]?.payload.caption).toContain("Расписание собеседований");
    const logs = await db.auditLog.findMany({ where: { action: "interview.export" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: admin.id, entityType: "season", meta: expect.objectContaining({ via: "TELEGRAM", slots: 1 }) });
  });
  it("!собес записывает и один раз перезаписывает кандидата через кнопки", async () => {
    const f = await setup();
    const app = await db.application.findFirstOrThrow({ where: { user: { telegramId: "12" } } });
    await db.interviewBooking.deleteMany({ where: { applicationId: app.id } });
    await db.stage.create({ data: { seasonId: app.seasonId, kind: "INTERVIEW", title: "Собес", order: 3, mode: "OPEN" } });
    const session = await db.assessmentSession.create({ data: { seasonId: app.seasonId, title: "ЦО", startsAt: new Date("2026-10-30T10:00:00+03:00") } });
    await db.assessmentInvite.create({ data: { applicationId: app.id, sessionId: session.id, attended: true } });
    const second = await db.interviewSlot.create({ data: { seasonId: app.seasonId, startsAt: new Date(`${botDay(new Date(), 2)}T11:00:00+03:00`), endsAt: new Date(`${botDay(new Date(), 2)}T11:45:00+03:00`), location: "Масловка", interviewers: { create: { userId: f.master.id } } } });
    const controls = () => (f.lastView()?.payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] }).inline_keyboard.flat();
    await f.text("!собес", "private", 12);
    expect(f.lastView()?.payload.text).toContain("Выберите удобный корпус");
    expect(await db.message.count()).toBe(0);
    await f.click("ivc:places", 12);
    await f.click(controls().find(item => item.text === "Рязанка")!.callback_data, 12);
    await f.click(controls().find(item => item.callback_data.startsWith("ivc:day:"))!.callback_data, 12);
    await f.click(controls().find(item => item.callback_data === `ivc:slot:${f.slot.id}`)!.callback_data, 12);
    expect(f.lastView()?.payload.text).toContain("Записаться на");
    await f.click(`ivc:book:${f.slot.id}`, 12);
    expect(await db.interviewBooking.count({ where: { applicationId: app.id, cancelledAt: null } })).toBe(1);
    expect(f.lastView()?.payload.text).toContain("Ваша запись");
    await f.click("ivc:places", 12);
    await f.click(controls().find(item => item.text === "Масловка")!.callback_data, 12);
    await f.click(controls().find(item => item.callback_data.startsWith("ivc:day:"))!.callback_data, 12);
    await f.click(`ivc:slot:${second.id}`, 12);
    expect(f.lastView()?.payload.text).toContain("единственную самостоятельную перезапись");
    await f.click(`ivc:book:${second.id}`, 12);
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).interviewReschedulesUsed).toBe(1);
    expect((await db.interviewBooking.findFirstOrThrow({ where: { applicationId: app.id, cancelledAt: null } })).slotId).toBe(second.id);
    await f.click(`ivc:book:${f.slot.id}`, 12);
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).interviewReschedulesUsed).toBe(1);
    expect(f.calls.filter(c => c.method === "sendMessage")).toHaveLength(1);
  });
  it("без явки на ЦО бот не открывает запись, а админ может выгрузить кандидатов", async () => {
    const f = await setup();
    const app = await db.application.findFirstOrThrow({ where: { user: { telegramId: "12" } } });
    await db.interviewBooking.deleteMany({ where: { applicationId: app.id } });
    await db.stage.create({ data: { seasonId: app.seasonId, kind: "INTERVIEW", title: "Собес", order: 3, mode: "OPEN" } });
    await f.text("!собес", "private", 12);
    expect(f.lastView()?.payload.text).toContain("после прохождения центра оценки");
    await f.click(`ivc:book:${f.slot.id}`, 12);
    expect(await db.interviewBooking.count({ where: { applicationId: app.id } })).toBe(0);
    await f.click("iv:export-candidates");
    expect(f.calls.filter(c => c.method === "sendDocument")).toHaveLength(0);
    const admin = await db.user.create({ data: { telegramId: "13", isOwner: true } });
    await f.click("iv:export-candidates", 13);
    expect(f.calls.filter(c => c.method === "sendDocument")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "candidate.export", actorId: admin.id } })).toBe(1);
    const session = await db.assessmentSession.create({ data: { seasonId: app.seasonId, title: "ЦО", startsAt: new Date("2026-10-30T10:00:00+03:00") } });
    await db.assessmentInvite.create({ data: { applicationId: app.id, sessionId: session.id, attended: true } });
    await f.click("iv:announce-preview", 13);
    expect(f.lastView()?.payload.text).toContain("1 кандидатов");
    await f.click("iv:announce-send", 13);
    await f.click("iv:announce-send", 13);
    expect(await db.notification.count({ where: { userId: app.userId, key: `interview-bot-access:${app.seasonId}` } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "interview.bot_announcement", actorId: admin.id } })).toBe(2);
  });
});
