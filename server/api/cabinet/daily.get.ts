import { dailyStatus, mskHour } from "~~/lib/games/daily";
import { notify } from "~~/lib/notifications/notify";
import { requireUser } from "~~/server/utils/session";

/**
 * Задание дня: вид, сид, решено ли, серия. Нерешившим после 10:00 МСК —
 * напоминание в колокольчик (ключ один на день, второго не будет).
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const now = new Date();
  const status = await dailyStatus(user.id, now);
  if (!status.solved && mskHour(now) >= 10) {
    await notify([
      {
        userId: user.id,
        category: "SYSTEM",
        title: "Задание дня ждёт",
        body: "Одна головоломка — и серия растёт.",
        url: "/cabinet/daily",
        key: `daily:${status.date}`,
      },
    ]);
  }
  return status;
});
