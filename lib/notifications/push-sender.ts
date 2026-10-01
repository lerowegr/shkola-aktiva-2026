import webpush from "web-push";

import type { Senders } from "./worker";

/**
 * Пуши PWA. Ключи VAPID — пара, которую сервер подписывает своими пушами:
 * без неё браузер такие пуши не примет. Сгенерировать:
 *   npx web-push generate-vapid-keys
 * Нет ключей — пуши выключены, доставки помечаются пропущенными.
 */
export function createPushSender(): Senders["push"] {
  const publicKey = process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;

  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:no-reply@example.com", publicKey, privateKey);

  return async (target, message) => {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify({ title: message.title, body: message.body, url: message.url }),
      // Сутки: пуш, не дошедший за день, уже не новость.
      { TTL: 24 * 60 * 60 },
    );
  };
}
