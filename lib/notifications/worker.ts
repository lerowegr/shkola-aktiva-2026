import { db } from "~~/lib/db";

/**
 * Разносчик уведомлений во внешние каналы.
 *
 * Берёт созревшие доставки и шлёт. Как именно шлёт — не его забота:
 * отправители приходят снаружи (senders), поэтому логику повтора, пропуска
 * и очистки подписок можно проверить тестом без сети.
 *
 * Захват доставки — условным обновлением: «увеличь число попыток, если
 * статус всё ещё PENDING и попыток столько же». Если два прохода разносчика
 * пересеклись, второй увидит, что доставку уже забрали, и пропустит её.
 */

export interface OutgoingMessage {
  title: string;
  body: string | null;
  /** Путь на сайте или полный адрес. */
  url: string | null;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Ошибка отправителя пуша: 404 и 410 значат, что подписки больше нет. */
export interface PushError extends Error {
  statusCode?: number;
}

export interface Senders {
  telegram: ((chatId: string, message: OutgoingMessage) => Promise<void>) | null;
  push: ((target: PushTarget, message: OutgoingMessage) => Promise<void>) | null;
}

export const MAX_ATTEMPTS = 3;
/** Пауза между сообщениями в Telegram: не больше 25 в секунду при лимите 30. */
export const TELEGRAM_GAP_MS = 40;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface WorkerResult {
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

export async function processDeliveries(params: {
  senders: Senders;
  now?: Date;
  limit?: number;
  gapMs?: number;
}): Promise<WorkerResult> {
  const now = params.now ?? new Date();
  const result: WorkerResult = { sent: 0, skipped: 0, failed: 0, retried: 0 };

  const due = await db.notificationDelivery.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: params.limit ?? 50,
    select: {
      id: true,
      channel: true,
      attempts: true,
      userId: true,
      notification: { select: { title: true, body: true, url: true, readAt: true } },
      user: { select: { telegramId: true, status: true } },
    },
  });

  for (const delivery of due) {
    const claimed = await db.notificationDelivery.updateMany({
      where: { id: delivery.id, status: "PENDING", attempts: delivery.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const attempt = delivery.attempts + 1;
    const skip = async (reason: string) => {
      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "SKIPPED", error: reason },
      });
      result.skipped++;
    };

    if (delivery.notification.readAt) {
      await skip("Прочитано на сайте раньше");
      continue;
    }
    if (delivery.user.status !== "ACTIVE") {
      await skip("Доступ закрыт");
      continue;
    }

    const message: OutgoingMessage = {
      title: delivery.notification.title,
      body: delivery.notification.body,
      url: delivery.notification.url,
    };

    try {
      if (delivery.channel === "TELEGRAM") {
        if (!params.senders.telegram) {
          await skip("Бот не настроен");
          continue;
        }
        if (!delivery.user.telegramId) {
          await skip("Telegram не привязан");
          continue;
        }
        await params.senders.telegram(delivery.user.telegramId, message);
        await sleep(params.gapMs ?? TELEGRAM_GAP_MS);
      } else {
        if (!params.senders.push) {
          await skip("Пуши не настроены");
          continue;
        }
        const targets = await db.pushSubscription.findMany({
          where: { userId: delivery.userId },
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        });
        if (targets.length === 0) {
          await skip("Нет подписки на пуши");
          continue;
        }

        let delivered = 0;
        let lastError: unknown = null;
        for (const target of targets) {
          try {
            await params.senders.push(target, message);
            delivered++;
          } catch (error) {
            const status = (error as PushError).statusCode;
            // Подписки больше нет: браузер отозвал её или человек её снёс.
            if (status === 404 || status === 410) {
              await db.pushSubscription.delete({ where: { id: target.id } }).catch(() => null);
            } else {
              lastError = error;
            }
          }
        }

        if (delivered === 0) {
          if (lastError) throw lastError;
          await skip("Подписки устарели");
          continue;
        }
      }

      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
      result.sent++;
    } catch (error) {
      const text = String(error instanceof Error ? error.message : error).slice(0, 500);

      if (attempt >= MAX_ATTEMPTS) {
        await db.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: "FAILED", error: text },
        });
        result.failed++;
      } else {
        // Следующая попытка — через 2, потом 4 минуты: сеть успевает ожить.
        await db.notificationDelivery.update({
          where: { id: delivery.id },
          data: { error: text, scheduledAt: new Date(now.getTime() + attempt * 2 * 60 * 1000) },
        });
        result.retried++;
      }
    }
  }

  return result;
}
