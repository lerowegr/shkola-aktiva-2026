import { InlineKeyboard, type Bot, type Context } from "grammy";
import { interviewPanel } from "./interview-panel";
import { botReviewHistory } from "../lib/interviews/bot-history";
import { can } from "../lib/permissions";
import { fullName } from "../lib/applications/staff";
import { beginBotDraft, botCanManageAll, botConversation, botSlotTitle, clearBotDraft, confirmBotDraft, fillBotDraft, getBotDraft, interviewBotActor, listBotSlots, loadBotSlot, type InterviewBotDraft } from "../lib/interviews/bot-staff";
import { botDay, botTime, parseBotDay, parseBotTime } from "../lib/interviews/bot-rules";

const cancelKeyboard = () => new InlineKeyboard().text("Отмена", "iv:cancel");
async function menu(ctx: Context) {
  if (ctx.chat?.type !== "private" || !ctx.from) return;
  const id = String(ctx.from.id), actor = await interviewBotActor(id);
  if (!actor) { await interviewPanel(ctx, "Есть вопрос организаторам — напишите его сюда. Сайт и личный кабинет доступны через /start."); return; }
  await clearBotDraft(id);
  const keyboard = new InlineKeyboard().text("Сегодня", `iv:list:${botDay()}:0`).text("Завтра", `iv:list:${botDay(new Date(), 1)}:0`);
  if (botCanManageAll(actor)) keyboard.row().text("Выбрать дату — все мастера", "iv:day");
  await interviewPanel(ctx, `${botCanManageAll(actor) ? "Собеседования всех мастеров" : "Мои собеседования"}\n\nВыберите день. В карточке можно написать участнику и изменить время или место. Всё время — московское. /cancel — отменить ввод.`, { reply_markup: keyboard });
}
async function showList(ctx: Context, day: string, page = 0) {
  const list = await listBotSlots(String(ctx.from!.id), day, page);
  if (!list) { await interviewPanel(ctx, "Расписание недоступно. Проверьте дату и доступ в кабинете организатора."); return; }
  await clearBotDraft(String(ctx.from!.id));
  const keyboard = new InlineKeyboard();
  for (const slot of list.slots) {
    const candidate = slot.bookings[0]?.application;
    keyboard.text(`${botTime(slot.startsAt)} · ${(candidate ? fullName(candidate) : "Свободно").slice(0, 55)}`, `iv:slot:${slot.id}`).row();
  }
  if (page > 0) keyboard.text("← Назад", `iv:list:${day}:${page - 1}`);
  if ((page + 1) * 8 < list.total) keyboard.text("Далее →", `iv:list:${day}:${page + 1}`);
  keyboard.row().text("Меню", "iv:menu");
  await interviewPanel(ctx, `${botCanManageAll(list.actor) ? "Все собеседования" : "Мои собеседования"} на ${day.split("-").reverse().join(".")}\nВсего: ${list.total}. Страница ${page + 1}. Время — МСК.${!list.total ? "\nНа этот день слотов нет." : "\nВыберите встречу:"}`, { reply_markup: keyboard });
}
async function card(ctx: Context, slotId: string) {
  const id = String(ctx.from!.id), actor = await interviewBotActor(id), slot = await loadBotSlot(id, slotId);
  if (!actor || !slot) { await interviewPanel(ctx, "Собеседование недоступно: оно снято или ведёт другой мастер."); return; }
  await clearBotDraft(id);
  const keyboard = new InlineKeyboard();
  if (slot.bookings.length) keyboard.text("Оценки: анкета, ДЗ, ЦО", `iv:reviews:${slot.id}:0`).row();
  if (slot.bookings.length && can(actor, "messages.reply")) {
    if (slot.bookings[0]?.application.user.telegramId) keyboard.text("Написать участнику", `iv:message:${slot.id}`).row();
    keyboard.text("Последние сообщения", `iv:chat:${slot.id}`).row();
  }
  if (slot.startsAt > new Date()) keyboard.text("Изменить время", `iv:time:${slot.id}`).row().text("Указать аудиторию", `iv:room:${slot.id}`).text("Изменить корпус", `iv:location:${slot.id}`).row();
  keyboard.text("Обновить карточку", `iv:slot:${slot.id}`).row().text("Меню", "iv:menu");
  await interviewPanel(ctx, botSlotTitle(slot).slice(0, 3800), { reply_markup: keyboard });
}
async function begin(ctx: Context, kind: InterviewBotDraft["kind"], slotId?: string) {
  const draft = await beginBotDraft(String(ctx.from!.id), kind, slotId);
  if (!draft) { await interviewPanel(ctx, "Действие недоступно. Проверьте права и актуальность записи."); return; }
  const slot = slotId ? await loadBotSlot(String(ctx.from!.id), slotId) : null;
  const prompts = {
    message: `Участник: ${slot?.bookings.map(b => fullName(b.application)).join(", ")}\nСледующее текстовое сообщение станет черновиком этому участнику. До 3500 символов. Затем подтвердите отправку.`,
    time: "Введите новое начало: ДД.ММ.ГГГГ ЧЧ:ММ, например 05.11.2026 17:25. Время московское; встреча длится 45 минут. Проверим перерывы и занятость. Участник получит уведомление.",
    room: "Введите аудиторию или подробности места (до 100 символов). Дефис - убирает аудиторию. Участник получит уведомление.",
    location: "Введите новый корпус/адрес (до 300 символов). Участник получит уведомление.",
    day: "Введите дату: ДД.ММ.ГГГГ, например 05.11.2026. Покажу собеседования всех мастеров.",
  };
  await interviewPanel(ctx, prompts[kind], { reply_markup: cancelKeyboard() });
}
export function registerInterviewBot(bot: Bot) {
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === "private" && ctx.from && ctx.message?.text?.startsWith("/")) await clearBotDraft(String(ctx.from.id));
    await next();
  });
  bot.command(["help", "interviews"], menu);
  bot.command("today", async ctx => { if (ctx.chat.type === "private") await showList(ctx, botDay()); });
  bot.command("tomorrow", async ctx => { if (ctx.chat.type === "private") await showList(ctx, botDay(new Date(), 1)); });
  bot.command("cancel", async ctx => { if (ctx.chat.type === "private") { await clearBotDraft(String(ctx.from!.id)); await interviewPanel(ctx, "Ввод отменён. Сообщение участнику не отправлено. /help — меню."); } });
  bot.callbackQuery(/^iv:/, async ctx => {
    await ctx.answerCallbackQuery();
    if (ctx.chat?.type !== "private") return;
    if (!await interviewBotActor(String(ctx.from.id))) { await interviewPanel(ctx, "Раздел доступен действующим мастерам и администраторам с привязанным Telegram."); return; }
    const data = ctx.callbackQuery.data;
    if (data === "iv:menu" || data === "iv:cancel") { await menu(ctx); return; }
    if (data === "iv:day") { await begin(ctx, "day"); return; }
    const list = data.match(/^iv:list:(20\d{2}-\d{2}-\d{2}):(\d{1,4})$/);
    if (list) { await showList(ctx, list[1]!, Number(list[2])); return; }
    const reviews = data.match(/^iv:reviews:([a-zA-Z0-9-]{1,40}):(\d{1,4})$/);
    if (reviews) {
      await clearBotDraft(String(ctx.from.id));
      const history = await botReviewHistory(String(ctx.from.id), reviews[1]!);
      const page = Number(reviews[2]);
      if (!history || !history.pages[page]) { await interviewPanel(ctx, "Оценки недоступны или страница устарела. Откройте встречу заново.", { reply_markup: new InlineKeyboard().text("Меню", "iv:menu") }); return; }
      const keyboard = new InlineKeyboard();
      if (page > 0) keyboard.text("← Назад", `iv:reviews:${reviews[1]}:${page - 1}`);
      if (page + 1 < history.pages.length) keyboard.text("Далее →", `iv:reviews:${reviews[1]}:${page + 1}`);
      keyboard.row().text("К встрече", `iv:slot:${reviews[1]}`).text("Меню", "iv:menu");
      await interviewPanel(ctx, `${history.name.slice(0, 250)}\nПредыдущие оценки · ${page + 1}/${history.pages.length}\n\n${history.pages[page]}`, { reply_markup: keyboard }); return;
    }
    const action = data.match(/^iv:(slot|chat|message|room|time|location):([a-zA-Z0-9-]{1,40})$/);
    if (action) {
      const kind = action[1]!, slotId = action[2]!;
      if (kind === "slot") { await card(ctx, slotId); return; }
      if (kind === "chat") {
        await clearBotDraft(String(ctx.from.id));
        const rows = await botConversation(String(ctx.from.id), slotId);
        await interviewPanel(ctx, rows === null ? "Переписка недоступна." : rows.length ? rows.map(m => `${m.author === "STAFF" ? "Организатор" : "Участник"} (${botTime(m.createdAt)}): ${m.text.slice(0, 650)}`).join("\n\n").slice(0, 3800) : "Сообщений пока нет.", { reply_markup: new InlineKeyboard().text("К встрече", `iv:slot:${slotId}`) });
        return;
      }
      await begin(ctx, kind as InterviewBotDraft["kind"], slotId); return;
    }
    const confirm = data.match(/^iv:ok:([a-f0-9]{12})$/);
    if (confirm) {
      const result = await confirmBotDraft(String(ctx.from.id), confirm[1]!);
      await interviewPanel(ctx, result.message, { reply_markup: result.ok && "slotId" in result ? new InlineKeyboard().text("К встрече", `iv:slot:${result.slotId}`).row().text("Меню", "iv:menu") : new InlineKeyboard().text("Меню", "iv:menu") });
      return;
    }
    await interviewPanel(ctx, "Кнопка устарела. /help — открыть меню заново.");
  });
  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();
    const text = ctx.message.text.trim();
    if (/^(?:!\s*)?(?:помощь|help)$|^!$/i.test(text)) { await menu(ctx); return; }
    // Команды обрабатываются отдельно и никогда не становятся текстом участнику.
    if (text.startsWith("/")) return next();
    const id = String(ctx.from.id), draft = await getBotDraft(id);
    if (!draft) {
      if (await interviewBotActor(id)) { await interviewPanel(ctx, "Выберите собеседование и действие через /help. Чтобы написать участнику, сначала нажмите «Написать участнику» в его карточке."); return; }
      return next();
    }
    if (draft.kind === "day") {
      const day = parseBotDay(text);
      if (!day) { await interviewPanel(ctx, "Дата не распознана. Введите ДД.ММ.ГГГГ или /cancel."); return; }
      await showList(ctx, day); return;
    }
    let value = text;
    if (draft.kind === "time") {
      const at = parseBotTime(text);
      if (!at || at <= new Date()) { await interviewPanel(ctx, "Введите будущее время в формате ДД.ММ.ГГГГ ЧЧ:ММ по Москве или /cancel."); return; }
      value = at.toISOString();
    }
    const max = { message: 3500, room: 100, location: 300, time: 100 }[draft.kind];
    if (!text || text.length > max) { await interviewPanel(ctx, `Введите текст длиной от 1 до ${max} символов или /cancel.`); return; }
    const saved = await fillBotDraft(id, value);
    const slot = draft.slotId ? await loadBotSlot(id, draft.slotId) : null;
    if (!saved || !slot) { await interviewPanel(ctx, "Действие устарело. /help — начать заново."); return; }
    const candidate = slot.bookings.map(b => fullName(b.application)).join(", ") || "Свободный слот";
    await interviewPanel(ctx, `${draft.kind === "message" ? "Отправить сообщение" : "Подтвердить изменение"}\n${candidate.slice(0, 200)}\n${botSlotTitle(slot).slice(0, 250)}\n\n${text.slice(0, 3500)}`, { reply_markup: new InlineKeyboard().text("Подтвердить", `iv:ok:${saved.token}`).text("Отмена", "iv:cancel") });
  });
}
