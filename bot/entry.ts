import { InlineKeyboard } from "grammy";

/** Telegram принимает web_app только с HTTPS. На HTTP показываем обычные адреса. */
export function entryKeyboard(appUrl: string): InlineKeyboard | undefined {
  if (!appUrl.startsWith("https://")) return undefined;
  return new InlineKeyboard()
    .webApp("Пройти тест про ША", `${appUrl}/tg?screen=test`)
    .row()
    .webApp("Сайт / личный кабинет", `${appUrl}/tg?screen=site`);
}

export function entryGreeting(appUrl: string): string {
  const greeting =
    "Привет! Это бот Школы Актива 2026.\n\n" +
    "Что хочешь открыть?\n" +
    "• Тест про ША — проверь, насколько хорошо ты знаешь Школу Актива.\n" +
    "• Сайт / личный кабинет — узнай о ША, зарегистрируйся или продолжи участие в отборе.\n\n" +
    "Здесь также приходят новости отбора и ответы организаторов. Есть вопрос — просто напиши его сюда.";
  return appUrl.startsWith("https://")
    ? greeting
    : `${greeting}\n\nТест: ${appUrl}/tg?screen=test\nСайт: ${appUrl}/tg?screen=site`;
}
