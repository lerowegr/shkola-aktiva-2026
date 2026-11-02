import { createHash } from "node:crypto";
import { InlineKeyboard, type Bot, type Context } from "grammy";
import { db } from "../lib/db";
import { book, loadInterview, type CandidateInterview } from "../lib/interviews/booking";
import { botTime, botWhen } from "../lib/interviews/bot-rules";
import { mskDayKey } from "../app/utils/moscow";
import { renderBotPanel } from "./interview-panel";

const placeKey = (place: string) => createHash("sha256").update(place).digest("hex").slice(0, 12);
const places = (iv: CandidateInterview) => [...new Set(iv.slots.map(slot => slot.location))].sort((a, b) => a.localeCompare(b, "ru"));
const button = (text: string, callback: string) => new InlineKeyboard().text(text, callback);

async function candidate(ctx: Context) {
  if (ctx.chat?.type !== "private" || !ctx.from) return null;
  const user = await db.user.findUnique({ where: { telegramId: String(ctx.from.id) }, select: { id: true, status: true } });
  return user?.status === "ACTIVE" ? user : null;
}
async function panel(ctx: Context, userId: string, text: string, keyboard = new InlineKeyboard()) {
  await renderBotPanel(ctx, `bot-candidate-interview-panel:${userId}`, text, { reply_markup: keyboard });
}
async function menu(ctx: Context, notice = "") {
  if (ctx.chat?.type !== "private") return;
  const user = await candidate(ctx);
  if (!user) { await ctx.reply("Чтобы записаться, сначала откройте /start и войдите через свой Telegram. Если аккаунт не найден, напишите организаторам."); return; }
  const iv = await loadInterview(user.id);
  if (!iv) { await panel(ctx, user.id, "Этап собеседований пока не открыт. Проверьте позже."); return; }
  const lines = ["Собеседование · Школа Актива", "Время указано по Москве."];
  if (notice) lines.push("", notice);
  if (iv.final) { lines.push("", "Итоги отбора уже опубликованы. Запись закрыта."); await panel(ctx, user.id, lines.join("\n")); return; }
  if (iv.booking) {
    lines.push("", `Ваша запись: ${botWhen(iv.booking.startsAt)}–${botTime(iv.booking.endsAt)}`, iv.booking.location, iv.booking.room ? `Аудитория ${iv.booking.room}` : "Аудиторию сообщат дополнительно.", `Самостоятельных перезаписей осталось: ${Math.max(0, 1 - iv.reschedulesUsed)} из 1.`);
    if (iv.booking.canChange) lines.push(`Перезапись доступна до ${botWhen(iv.booking.changeDeadline)}.`);
  }
  if (!iv.allowed) lines.push("", iv.eligibilityMessage ?? "Запись недоступна.");
  else if (iv.bookingCancelled) lines.push("", "Предыдущая запись отменена. Для новой записи обратитесь к организаторам.");
  else if (iv.state !== "open") lines.push("", iv.state === "upcoming" ? "Запись пока не открыта." : "Запись закрыта. Если нужна помощь, напишите организаторам.");
  else if (iv.booking && !iv.booking.canChange) lines.push("", "Срок или единственная возможность перезаписи истекли. Для изменений обратитесь к организаторам.");
  else if (!iv.slots.length) lines.push("", "Свободных слотов сейчас нет. Проверьте позже или напишите организаторам.");
  else lines.push("", iv.booking ? "Перезаписаться можно только один раз. Выберите новый корпус, день и время." : "Выберите удобный корпус, затем день и время. Мастера выбирать не нужно.", "Первичная запись — до 20:00 накануне; перенос — один раз до 18:00 накануне.");
  const keyboard = new InlineKeyboard();
  if (iv.allowed && !iv.bookingCancelled && iv.state === "open" && iv.slots.length && (!iv.booking || iv.booking.canChange)) keyboard.text(iv.booking ? "Перезаписаться (1 раз)" : "Выбрать собеседование", "ivc:places").row();
  keyboard.text("Обновить", "ivc:menu");
  await panel(ctx, user.id, lines.join("\n"), keyboard);
}
async function choosePlace(ctx: Context) {
  const user = await candidate(ctx);
  if (!user) return menu(ctx);
  const iv = await loadInterview(user.id);
  if (!iv || !iv.allowed || iv.final || iv.state !== "open" || iv.bookingCancelled || (iv.booking && !iv.booking.canChange)) return menu(ctx);
  const campuses = places(iv), keyboard = new InlineKeyboard();
  for (const place of campuses) keyboard.text(place.slice(0, 60), `ivc:place:${placeKey(place)}`).row();
  keyboard.text("Назад", "ivc:menu");
  await panel(ctx, user.id, campuses.length ? "Выберите удобный корпус. Факультет не ограничивает выбор." : "Свободных мест сейчас нет.", keyboard);
}
async function chooseDay(ctx: Context, key: string) {
  const user = await candidate(ctx);
  if (!user) return menu(ctx);
  const iv = await loadInterview(user.id);
  if (!iv || !iv.allowed || iv.final || iv.state !== "open" || iv.bookingCancelled) return menu(ctx);
  const place = places(iv).find(value => placeKey(value) === key);
  if (!place) return choosePlace(ctx);
  const dates = [...new Set(iv.slots.filter(slot => slot.location === place).map(slot => mskDayKey(slot.startsAt)))].sort();
  const keyboard = new InlineKeyboard();
  for (const date of dates) keyboard.text(date.split("-").reverse().join("."), `ivc:day:${key}:${date}`).row();
  keyboard.text("К корпусам", "ivc:places");
  await panel(ctx, user.id, `${place}\nВыберите день. Время — московское.`, keyboard);
}
async function chooseTime(ctx: Context, key: string, day: string, page: number) {
  const user = await candidate(ctx);
  if (!user) return menu(ctx);
  const iv = await loadInterview(user.id);
  if (!iv || !iv.allowed || iv.final || iv.state !== "open" || iv.bookingCancelled) return menu(ctx);
  const place = places(iv).find(value => placeKey(value) === key);
  if (!place) return choosePlace(ctx);
  const slots = iv.slots.filter(slot => slot.location === place && mskDayKey(slot.startsAt) === day);
  const keyboard = new InlineKeyboard();
  for (const slot of slots.slice(page * 8, page * 8 + 8)) keyboard.text(`${botTime(slot.startsAt)}–${botTime(slot.endsAt)}`, `ivc:slot:${slot.id}`).row();
  if (page > 0) keyboard.text("← Назад", `ivc:time:${key}:${day}:${page - 1}`);
  if ((page + 1) * 8 < slots.length) keyboard.text("Далее →", `ivc:time:${key}:${day}:${page + 1}`);
  keyboard.row().text("К дням", `ivc:place:${key}`);
  await panel(ctx, user.id, `${place} · ${day.split("-").reverse().join(".")}\nВыберите свободное время.`, keyboard);
}
async function confirm(ctx: Context, slotId: string) {
  const user = await candidate(ctx);
  if (!user) return menu(ctx);
  const iv = await loadInterview(user.id);
  const slot = iv?.slots.find(item => item.id === slotId);
  if (!iv || !iv.allowed || iv.final || !slot) return menu(ctx, "Это время уже недоступно. Выберите другое.");
  const keyboard = button(iv.booking ? "Подтвердить перезапись" : "Записаться", `ivc:book:${slotId}`).row().text("Назад", "ivc:places");
  await panel(ctx, user.id, `${iv.booking ? "Перезаписаться" : "Записаться"} на ${botWhen(slot.startsAt)}–${botTime(slot.endsAt)}?\n${slot.location}${slot.room ? `, аудитория ${slot.room}` : " — аудиторию сообщат дополнительно"}.\n\n${iv.booking ? "Это израсходует единственную самостоятельную перезапись." : "Запись подтвердится после нажатия кнопки."}`, keyboard);
}
async function bookSlot(ctx: Context, slotId: string) {
  const user = await candidate(ctx);
  if (!user) return menu(ctx);
  const iv = await loadInterview(user.id);
  if (!iv || !iv.allowed || iv.final || iv.bookingCancelled || !iv.slots.some(slot => slot.id === slotId)) return menu(ctx, "Это время уже недоступно. Выберите другое.");
  const result = await book(user.id, slotId);
  await menu(ctx, result.message);
}

export function registerCandidateInterviewBot(bot: Bot) {
  bot.hears(/^!\s*собес$/i, ctx => menu(ctx));
  bot.callbackQuery(/^ivc:/, async ctx => {
    await ctx.answerCallbackQuery();
    if (ctx.chat?.type !== "private") return;
    const data = ctx.callbackQuery.data;
    if (data === "ivc:menu") return menu(ctx);
    if (data === "ivc:places") return choosePlace(ctx);
    const place = data.match(/^ivc:place:([a-f0-9]{12})$/);
    if (place) return chooseDay(ctx, place[1]!);
    const day = data.match(/^ivc:day:([a-f0-9]{12}):(20\d{2}-\d{2}-\d{2})$/);
    if (day) return chooseTime(ctx, day[1]!, day[2]!, 0);
    const time = data.match(/^ivc:time:([a-f0-9]{12}):(20\d{2}-\d{2}-\d{2}):(\d{1,3})$/);
    if (time) return chooseTime(ctx, time[1]!, time[2]!, Math.min(Number(time[3]), 100));
    const slot = data.match(/^ivc:(slot|book):([a-zA-Z0-9-]{1,40})$/);
    if (slot) return slot[1] === "book" ? bookSlot(ctx, slot[2]!) : confirm(ctx, slot[2]!);
    return menu(ctx, "Кнопка устарела. Выберите время заново.");
  });
}
