import { readPreferences } from "~~/lib/notifications/inbox";
import { db } from "~~/lib/db";
import { requireUser } from "~~/server/utils/session";

/** Тумблеры уведомлений и состояние каналов. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const devices = await db.pushSubscription.count({ where: { userId: user.id } });

  return {
    rows: await readPreferences(user.id, user.isStaff),
    telegram: { linked: user.hasTelegram, username: user.telegramUsername },
    pushDevices: devices,
  };
});
