import { db } from "~~/lib/db";
import type { NotificationCategory } from "~~/lib/generated/prisma/enums";

import { channelEnabled, EXTERNAL_CHANNELS } from "./categories";
import { deliveryTime } from "./schedule";

/**
 * Единственный вход для уведомлений.
 *
 * Колокольчик пишется сразу. Telegram и пуш ставятся в очередь доставки
 * и уходят разносчиком (worker.ts) через минуту — если к тому времени
 * человек не прочитал уведомление на сайте.
 *
 * Никогда не бросает исключение наружу: уведомление — побочный эффект, и
 * упавшая рассылка не должна отменять отправленную анкету или ответ
 * организатора. Ошибка попадает в лог сервера.
 */
export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  /** Куда ведёт нажатие — путь на сайте: /cabinet/messages. */
  url?: string | null;
  /** Ключ события: второе уведомление с тем же ключом не создаётся. */
  key?: string | null;
}

export async function notify(inputs: NotifyInput[], options: { urgent?: boolean; now?: Date } = {}): Promise<number> {
  if (inputs.length === 0) return 0;

  try {
    const created = await db.notification.createManyAndReturn({
      data: inputs.map((input) => ({
        userId: input.userId,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        url: input.url ?? null,
        key: input.key ?? null,
      })),
      skipDuplicates: true,
      select: { id: true, userId: true, category: true },
    });

    if (created.length === 0) return 0;

    const userIds = [...new Set(created.map((item) => item.userId))];
    const [users, prefs, subscriptions] = await Promise.all([
      db.user.findMany({
        where: { id: { in: userIds }, status: "ACTIVE" },
        select: { id: true, telegramId: true },
      }),
      db.notificationPreference.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, channel: true, category: true, enabled: true },
      }),
      db.pushSubscription.groupBy({ by: ["userId"], where: { userId: { in: userIds } } }),
    ]);

    const telegram = new Set(users.filter((user) => user.telegramId).map((user) => user.id));
    const active = new Set(users.map((user) => user.id));
    const push = new Set(subscriptions.map((row) => row.userId));
    const scheduledAt = deliveryTime(options.now ?? new Date(), { urgent: options.urgent ?? false });

    const deliveries = created.flatMap((notification) => {
      if (!active.has(notification.userId)) return [];
      const own = prefs.filter((pref) => pref.userId === notification.userId);

      return EXTERNAL_CHANNELS.filter((channel) => {
        if (!channelEnabled(own, channel, notification.category)) return false;
        return channel === "TELEGRAM" ? telegram.has(notification.userId) : push.has(notification.userId);
      }).map((channel) => ({
        notificationId: notification.id,
        userId: notification.userId,
        channel,
        scheduledAt,
      }));
    });

    if (deliveries.length > 0) {
      await db.notificationDelivery.createMany({ data: deliveries, skipDuplicates: true });
    }

    return created.length;
  } catch (error) {
    console.error("Не удалось создать уведомления", error);
    return 0;
  }
}
