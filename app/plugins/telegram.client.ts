import {
  inTelegram,
  loadTelegramSdk,
  stashInitData,
  telegramInitData,
} from "~/utils/telegram";

/**
 * Обустройство сайта внутри Telegram.
 *
 * Две вещи, без которых Mini App выглядит сломанным. `ready()` говорит
 * Telegram, что страница загрузилась, — иначе он держит поверх неё свой
 * крутящийся кружок. `expand()` разворачивает окно на весь экран: по
 * умолчанию Telegram открывает его половинкой, и сайт показывается в
 * щёлке высотой в треть телефона.
 *
 * Скрипт грузим только внутри Telegram — см. utils/telegram.ts.
 */
export default defineNuxtPlugin(async () => {
  if (!inTelegram()) return;

  // Подпись забираем из адреса сразу: Nuxt вот-вот уведёт на другую
  // страницу, и хвост адреса пропадёт.
  const initData = telegramInitData();
  if (initData) stashInitData(initData);

  const webApp = await loadTelegramSdk();
  if (!webApp) return;

  webApp.ready();
  webApp.expand();

  // Скрипт мог отдать подпись, которой не было в адресе.
  if (!initData && webApp.initData) stashInitData(webApp.initData);
});
