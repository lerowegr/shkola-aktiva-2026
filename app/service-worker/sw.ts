/// <reference lib="webworker" />

/**
 * Service worker Школы Актива. Основа — из ПК_Тасктрекера, плюс пуши.
 *
 * Что здесь происходит:
 *
 *  1. Сборка (js, css, шрифты, значки) кладётся в опись заранее — она
 *     одинакова для всех и не содержит ничего личного.
 *  2. Страницы — только из сети. Не получилось — показываем /offline.html.
 *     Разметку в кеш не кладём никогда: сервер рисует её под конкретного
 *     человека, а кеш принадлежит устройству, не человеку.
 *  3. Ответы ручек не кешируются вовсе: анкеты, оценки и переписка — те
 *     данные, которые на общем телефоне не должны пережить выход.
 *  4. Пуш: показать уведомление; нажатие — открыть нужный экран.
 */

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = "/offline.html";

// Опись собранных файлов подставляется сюда на сборке.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Обновляемся не молча: новая версия ждёт согласия на странице, иначе
// страница перезагрузилась бы посреди заполняемой анкеты.
self.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (typeof data === "object" && data !== null && (data as { type?: unknown }).type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

const offlineHandler = createHandlerBoundToURL(OFFLINE_URL);
const networkOnly = new NetworkOnly();

registerRoute(
  ({ request }) => request.mode === "navigate",
  async (options) => {
    try {
      return await networkOnly.handle(options);
    } catch {
      return offlineHandler(options);
    }
  },
);

// --- Пуши ---------------------------------------------------------------

interface PushPayload {
  title?: string;
  body?: string | null;
  url?: string | null;
}

/** Только свои адреса: чужую ссылку из пуша не открываем. */
function safeUrl(raw: string | null | undefined): string {
  try {
    const url = new URL(raw ?? "/cabinet", self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL("/cabinet", self.location.origin).href;
  } catch {
    return new URL("/cabinet", self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let payload: PushPayload;
  try {
    payload = (event.data?.json() as PushPayload) ?? {};
  } catch {
    payload = { body: event.data?.text() ?? null };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Школа Актива", {
      body: payload.body ?? undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "ru",
      data: { url: safeUrl(payload.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | null)?.url ?? safeUrl(null);

  event.waitUntil(
    (async () => {
      // Уже открытая вкладка сайта — переводим её, а не плодим новые.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const ours = windows.find((client) => client.url.startsWith(self.location.origin));
      if (ours) {
        await ours.focus();
        await ours.navigate(target).catch(() => null);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Без этого первая после установки вкладка до перезагрузки живёт без воркера.
clientsClaim();
