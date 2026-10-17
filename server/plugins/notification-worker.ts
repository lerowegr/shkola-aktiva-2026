import { materializeReminders } from "~~/lib/interviews/reminders";
import { materializeApplicationDeadline, materializeAssessmentReminders } from "~~/lib/notifications/selection-reminders";
import { materializeStageOpen } from "~~/lib/notifications/stage-open";
import { createPushSender } from "~~/lib/notifications/push-sender";
import { createTelegramSender } from "~~/lib/notifications/telegram-sender";
import { processDeliveries } from "~~/lib/notifications/worker";

/**
 * Разносчик уведомлений в процессе сайта: раз в 5 секунд забирает
 * созревшие доставки в Telegram и пуш.
 *
 * Метка на globalThis — против двойного запуска: в разработке Nitro
 * перезагружает плагины на каждую правку, и без неё таймеров становилось
 * бы столько, сколько правок.
 */
const INTERVAL_MS = 5000;
const globalWorker = globalThis as unknown as { shaWorker?: ReturnType<typeof setInterval> };

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV === "test" || process.env.NOTIFICATION_WORKER === "off") return;

  if (globalWorker.shaWorker) clearInterval(globalWorker.shaWorker);

  const senders = { telegram: createTelegramSender(), push: createPushSender() };
  let running = false;
  let lastReminders = 0;

  globalWorker.shaWorker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // Напоминания об этапах и «анкета открылась» — раз в минуту,
      // а не каждые 5 секунд.
      if (Date.now() - lastReminders >= 60_000) {
        lastReminders = Date.now();
        await materializeReminders();
        await materializeStageOpen();
        await materializeApplicationDeadline();
        await materializeAssessmentReminders();
      }
      const result = await processDeliveries({ senders });
      if (result.sent + result.failed > 0) {
        console.info(`[уведомления] отправлено ${result.sent}, не дошло ${result.failed}`);
      }
    } catch (error) {
      console.error("[уведомления] разносчик упал", error);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);

  nitroApp.hooks.hook("close", () => {
    if (globalWorker.shaWorker) clearInterval(globalWorker.shaWorker);
  });
});
