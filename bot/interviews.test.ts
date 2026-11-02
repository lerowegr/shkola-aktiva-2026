import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { createBot } from "./main";
import { botDay } from "~~/lib/interviews/bot-rules";

beforeEach(resetDatabase);
async function setup() {
  const season = await db.season.create({ data: { slug: "bot", title: "S", year: 2026, isCurrent: true } });
  const role = await db.role.create({ data: { slug: "r", name: "R", permissions: ["applications.review", "messages.reply"] } });
  const master = await db.user.create({ data: { telegramId: "11", roles: { create: { roleId: role.id } } } });
  const user = await db.user.create({ data: { telegramId: "12" } });
  const application = await db.application.create({ data: { seasonId: season.id, userId: user.id, status: "SUBMITTED", firstName: "Тестовый", lastName: "Участник" } });
  const slot = await db.interviewSlot.create({ data: { seasonId: season.id, startsAt: new Date(`${botDay(new Date(), 1)}T10:00:00+03:00`), endsAt: new Date(`${botDay(new Date(), 1)}T10:45:00+03:00`), location: "Рязанка", interviewers: { create: { userId: master.id } }, bookings: { create: { applicationId: application.id } } } });
  const bot = createBot("123456:test-local-no-network");
  bot.botInfo = { id: 99, is_bot: true, first_name: "Bot", username: "test_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  bot.api.config.use(async (previous, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: method === "answerCallbackQuery" ? true : { message_id: calls.length, date: 1, chat: { id: 11, type: "private" }, text: "" } } as Awaited<ReturnType<typeof previous>>;
  });
  let serial = 0;
  async function text(text: string, chatType: "private" | "group" = "private", from = 11) {
    await bot.handleUpdate({ update_id: ++serial, message: { message_id: serial, date: 1, from: { id: from, is_bot: false, first_name: "Тест" }, chat: chatType === "private" ? { id: from, type: "private", first_name: "Тест" } : { id: -1, type: "group", title: "Группа" }, text, ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] } : {}) } });
  }
  async function click(data: string, from = 11) {
    await bot.handleUpdate({ update_id: ++serial, callback_query: { id: String(serial), from: { id: from, is_bot: false, first_name: "Тест" }, chat_instance: "x", data, message: { message_id: 1, date: 1, chat: { id: from, type: "private", first_name: "Тест" }, text: "Меню" } } });
  }
  return { bot, calls, text, click, slot, master };
}
describe("реальные обработчики команд бота без сети", () => {
  it("!помощь и /tomorrow открывают inline-меню, группа не получает расписание", async () => {
    const f = await setup();
    await f.text("!помощь");
    expect(f.calls.at(-1)?.payload.text).toContain("Мои собеседования");
    expect(JSON.stringify(f.calls.at(-1)?.payload.reply_markup)).toContain("iv:list:");
    await f.text("/tomorrow");
    expect(JSON.stringify(f.calls.at(-1)?.payload.reply_markup)).toContain(`iv:slot:${f.slot.id}`);
    const count = f.calls.length;
    await f.text("/today", "group");
    expect(f.calls).toHaveLength(count);
  });
  it("карточка → черновик → подтверждение; текст без выбора не отправляется участнику", async () => {
    const f = await setup();
    await f.text("Привет"); expect(await db.message.count()).toBe(0);
    await f.click(`iv:slot:${f.slot.id}`);
    expect(f.calls.at(-1)?.payload.text).toContain("Тестовый");
    await f.click(`iv:message:${f.slot.id}`);
    await f.text("Жду на первом этаже");
    expect(await db.message.count()).toBe(0);
    const keyboard = f.calls.at(-1)?.payload.reply_markup as { inline_keyboard: { callback_data: string }[][] };
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
    expect(f.calls.at(-1)?.payload.text).not.toContain("Тестовый");
  });
});
