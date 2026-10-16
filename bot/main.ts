/**
 * Telegram-бот Школы Актива.
 *
 * Здесь только входящее: /start, вход на сайт по коду, привязка Telegram
 * к аккаунту и сообщения организаторам. Исходящие уведомления шлёт сайт
 * (server/plugins/notification-worker.ts) — бот для этого не нужен
 * запущенным.
 *
 * Запуск: npm run bot (нужен TELEGRAM_BOT_TOKEN в .env).
 */

import { pathToFileURL } from "node:url";

import { Bot, InlineKeyboard, type Context } from "grammy";

import { issueTempPassword } from "../lib/auth/temp-password";
import { confirmLoginCode, linkTelegram, upsertTelegramUser  } from "../lib/auth/telegram-users";
import { submitHomework } from "../lib/applications/homework";
import { receiveFromTelegram } from "../lib/messages/bot-inbox";

const APP_URL = (process.env.NUXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function telegramUser(ctx: Context) {
  const from = ctx.from!;
  return {
    id: String(from.id),
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
    username: from.username ?? null,
  };
}

/**
 * Кнопка «Открыть» — только на https: Telegram не открывает Mini App по
 * http и не принимает ссылки на localhost. Локально бот просто пишет адрес.
 */
function openKeyboard(): InlineKeyboard | undefined {
  if (!APP_URL.startsWith("https://")) return undefined;
  return new InlineKeyboard().webApp("Открыть Школу Актива", `${APP_URL}/tg`);
}

const GREETING =
  "Привет! Это бот Школы Актива 2026.\n\n" +
  "Здесь приходят новости отбора: когда открылся этап, сколько осталось до дедлайна и что ответили организаторы.\n\n" +
  "Есть вопрос — просто напишите его сюда, организаторы ответят.";

/**
 * «Забыли пароль?» на сайте ведёт сюда: Telegram уже знает, кто это, и
 * временный пароль на 24 часа приходит только в личные сообщения.
 */
async function sendTempPassword(ctx: Context) {
  if (ctx.chat?.type !== "private") return;
  const result = await issueTempPassword(String(ctx.from!.id));
  if (!result.ok) {
    const replies = {
      no_account: `Аккаунта с этим Telegram пока нет. Зарегистрируйтесь через Telegram на сайте: ${APP_URL}/login`,
      no_credentials: `У вас ещё нет логина и пароля — их задают при знакомстве на сайте. Войдите через Telegram: ${APP_URL}/login`,
      blocked: "Доступ закрыт. Если это ошибка — напишите организаторам.",
    } as const;
    await ctx.reply(replies[result.reason]);
    return;
  }
  const until = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(result.expiresAt);
  await ctx.reply(
    `Временный пароль: ${result.password}\n` +
      `${result.signIn.includes("@") ? "Почта" : "Логин"}: ${result.signIn}\n\n` +
      `Действует до ${until} (МСК). Войдите на сайте во вкладке «${result.staff ? "Организаторам" : "Участникам"}» — ` +
      "сразу после входа сайт попросит придумать новый пароль.\n\n" +
      "Если пароль просили не вы — ничего не делайте: старый пароль продолжает работать.",
    { reply_markup: APP_URL.startsWith("https://") ? new InlineKeyboard().url("Открыть сайт", `${APP_URL}/login`) : undefined },
  );
}

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.command("password", sendTempPassword);

  bot.command("start", async (ctx) => {
    const payload = ctx.match?.trim() ?? "";

    if (payload.startsWith("login_")) {
      const code = payload.slice("login_".length);

      /*
       * Спрашиваем, а не подтверждаем молча.
       *
       * Иначе чужой человек мог бы получить код на своём компьютере, прислать
       * ссылку «жми, тут розыгрыш», и нажавший впустил бы его в свой кабинет.
       * Кнопка с прямым вопросом превращает такую ссылку в явное «это не я».
       */
      await ctx.reply(
        "На сайте Школы Актива нажали «Войти через Telegram». Это вы?\n\n" +
          "Если вы сейчас не входили на сайт — нажмите «Нет»: кто-то пытается войти под вашим Telegram.",
        {
          reply_markup: new InlineKeyboard()
            .text("Да, это я", `login:${code}`)
            .text("Нет", "login_no"),
        },
      );
      return;
    }

    if (payload === "reset") {
      await sendTempPassword(ctx);
      return;
    }

    if (payload.startsWith("link_")) {
      const result = await linkTelegram(payload.slice("link_".length), telegramUser(ctx));
      const replies = {
        stale: "Ссылка устарела. Нажмите «Привязать Telegram» на сайте ещё раз.",
        taken: "Этот Telegram уже привязан к другому аккаунту Школы Актива. Напишите организаторам — они объединят аккаунты.",
        blocked: "Доступ закрыт. Если это ошибка — напишите организаторам.",
      } as const;
      await ctx.reply(
        result.ok
          ? `${result.name ? `${result.name}, готово` : "Готово"}! Теперь новости отбора и ответы организаторов будут приходить сюда.`
          : replies[result.reason],
      );
      return;
    }

    await ctx.reply(
      openKeyboard() ? GREETING : `${GREETING}\n\nСайт: ${APP_URL}`,
      { reply_markup: openKeyboard() },
    );
  });

  bot.callbackQuery(/^login:(.+)$/, async (ctx) => {
    const code = ctx.match[1]!;
    const result = await confirmLoginCode(code, telegramUser(ctx));

    await ctx.answerCallbackQuery();

    if (result.ok) {
      await ctx.editMessageText("Готово — возвращайтесь на сайт, вход произойдёт сам.");
    } else if (result.reason === "blocked") {
      await ctx.editMessageText("Доступ закрыт. Если это ошибка — напишите организаторам.");
    } else {
      await ctx.editMessageText("Ссылка устарела. Нажмите «Войти через Telegram» на сайте ещё раз.");
    }
  });

  bot.callbackQuery("login_no", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Хорошо, вход отменён. Никто не вошёл под вашим Telegram.");
  });

  // Всё, что человек пишет боту текстом, — сообщение организаторам.
  bot.on("message:text", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    // Незнакомая команда — не вопрос организаторам.
    if (ctx.message.text.startsWith("/")) {
      await ctx.reply("Такой команды нет. Есть вопрос — напишите его обычным сообщением.");
      return;
    }
    const result = await receiveFromTelegram(telegramUser(ctx), ctx.message.text);
    if (result.reply) await ctx.reply(result.reply);
  });

  // PDF в личку — сдача домашнего задания (если этап открыт и человек допущен).
  bot.on("message:document", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const document = ctx.message.document;

    if (document.mime_type !== "application/pdf") {
      await ctx.reply("Домашнее задание принимаю в PDF. Сохраните работу в PDF и пришлите ещё раз.");
      return;
    }
    // Telegram отдаёт ботам файлы до 20 МБ — столько же принимает и сайт.
    if ((document.file_size ?? 0) > 20 * 1024 * 1024) {
      await ctx.reply("Файл больше 20 МБ. Сожмите PDF или загрузите работу на сайте.");
      return;
    }

    const user = await upsertTelegramUser(telegramUser(ctx));
    const file = await ctx.getFile();
    const response = await fetch(`https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`);
    if (!response.ok) {
      await ctx.reply("Не получилось скачать файл. Попробуйте ещё раз через минуту.");
      return;
    }

    const result = await submitHomework({
      userId: user.id,
      file: { filename: document.file_name ?? "работа.pdf", data: new Uint8Array(await response.arrayBuffer()) },
      text: ctx.message.caption ?? null,
      via: "TELEGRAM",
    });
    await ctx.reply(result.message);
  });

  bot.on("message", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    await ctx.reply("Принимаю текст и PDF. Вопрос организаторам — обычным сообщением, домашнее задание — файлом PDF.");
  });

  bot.catch((error) => {
    console.error("Ошибка в боте", error.error);
  });

  return bot;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    console.error(
      "Не задан TELEGRAM_BOT_TOKEN. Заведите бота в @BotFather и впишите токен в .env.",
    );
    process.exit(1);
  }

  const bot = createBot(token);
  await bot.api.setMyCommands([
    { command: "start", description: "Открыть Школу Актива" },
    { command: "password", description: "Забыли пароль — временный на 24 часа" },
  ]);

  console.log("Бот запущен.");
  await bot.start();
}

// Сравнение через pathToFileURL: в пути проекта кириллица и пробелы.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
