# Этап 3 «Сообщения и уведомления» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Переписка кандидата с организаторами (на сайте и через бота, как вкладка «Сообщения» в шаблоне) и уведомления в четырёх каналах: колокольчик на сайте, Telegram, пуш PWA, Mini App (через сообщение бота).

**Architecture:** Событие → `notify()` пишет уведомление в колокольчик сразу и ставит доставки в Telegram и пуш в очередь (`NotificationDelivery`) с задержкой в минуту. Фоновый разносчик в процессе сайта (Nitro-плагин) раз в несколько секунд берёт созревшие доставки: если человек уже прочитал уведомление на сайте — пропускает, иначе шлёт. Ночью (23:00–08:00 по Москве) несрочное ждёт утра. Telegram-отправка идёт с сайта через Bot API; процесс бота (`npm run bot`) только принимает входящие. Отправители подменяемые — логику разносчика тестируем без сети.

**Tech Stack:** как раньше + `web-push` (VAPID), `@vite-pwa/nuxt` + workbox (как в ПК_Тасктрекер).

**Spec:** `docs/specs/2026-09-28-sha-platform.md`

## Global Constraints

- Всё из `CLAUDE.md`.
- Уведомление — побочный эффект: его сбой никогда не отменяет действие, которое его вызвало.
- Telegram — не чаще 25 сообщений в секунду (лимит Bot API — 30).
- Без `TELEGRAM_BOT_TOKEN` и без VAPID-ключей сайт работает, доставки в эти каналы помечаются пропущенными.
- Сообщения видит любой с правом `messages.reply` — отбор единый поток, общий ящик.

## Задачи

### Task 1: Схема
- [x] `NotificationChannel { INAPP TELEGRAM PUSH }`, `NotificationCategory { SELECTION MESSAGES REVIEW SYSTEM }`, `DeliveryStatus { PENDING SENT FAILED SKIPPED }`.
- [x] `Notification` (userId, category, title, body, url, key, readAt; `@@unique([userId, key])`), `NotificationPreference` (userId, channel, category, enabled), `NotificationDelivery` (notificationId, userId, channel, status, attempts, scheduledAt, sentAt, error), `PushSubscription` (userId, endpoint unique, p256dh, auth, userAgent).
- [x] `MessageAuthor { CANDIDATE STAFF BOT }`, `MessageThread` (seasonId, candidateId, lastMessageAt, staffReadAt, candidateReadAt; `@@unique([seasonId, candidateId])`), `Message` (threadId, author, authorId, text, via SITE|TELEGRAM).
- [x] `TelegramLinkCode` (code, userId, expiresAt, consumedAt) — привязка Telegram к аккаунту, вошедшему по почте.

### Task 2: Расписание доставки — `lib/notifications/schedule.ts`
**Produces:** `deliveryTime(now, { urgent }) → Date`.
Тесты: днём — через минуту; в 23:30 по Москве — в 08:00 следующего утра; в 03:00 — в 08:00 того же утра; срочное — через минуту в любое время.

### Task 3: `notify()` и разносчик — `lib/notifications/{categories,notify,worker}.ts`
**Produces:** `notify(inputs: NotifyInput[])`, `processDeliveries({ now, senders, limit }) → { sent, skipped, failed }`, `Senders { telegram(chatId, message), push(subscription, payload) }`.
Тесты: колокольчик пишется сразу, повтор по ключу не дублирует; доставка в Telegram создаётся только тем, у кого он привязан и не выключен; в пуш — только тем, у кого есть подписка; прочитанное до отправки — SKIPPED; ошибка — повтор с паузой, после третьей — FAILED; устаревшая подписка пуша (404/410) удаляется.

### Task 4: Колокольчик и настройки
- [x] `GET /api/notifications`, `POST /api/notifications/read` (ids или все).
- [x] `GET/POST /api/notifications/preferences` — тумблеры по каналам и категориям.
- [x] Колокольчик в шапке: число непрочитанных, выпадающий список, «Прочитать все»; опрос раз в 30 секунд и при возврате на вкладку.
- [x] `/cabinet/settings`: каналы, кнопка «Включить уведомления на этом устройстве», «Привязать Telegram».

### Task 5: Переписка — `lib/messages/threads.ts`
**Produces:** `threadFor(seasonId, candidateId)`, `postMessage({ threadId, author, authorId, text, via })`, `listThreads(seasonId, query)`, `loadThread(threadId)`, `markRead(threadId, side)`.
- [x] Кандидат написал → уведомление его мастерам (если анкета назначена), ветка непрочитана для организаторов.
- [x] Организатор ответил → уведомление кандидату (сайт, Telegram, пуш) со ссылкой на `/cabinet/messages`.
- Тесты: непрочитанность веток; ответ создаёт уведомление кандидату; сообщение кандидата — его мастеру.

### Task 6: Бот
- [x] Текст от человека → сообщение в ветке (via TELEGRAM) + автоответ «Спасибо, получили — ответим здесь же» не чаще раза в 30 минут.
- [x] `/start link_<код>` — привязать Telegram к аккаунту; занятый Telegram — понятный отказ.

### Task 7: Страницы
- [x] `/staff/messages` как в шаблоне: слева ветки с поиском и счётчиком новых, справа переписка и поле «Сообщение кандидату — придёт от бота». Вкладка «Сообщения» открывается по праву `messages.reply`, со счётчиком.
- [x] `/cabinet/messages` — переписка кандидата с организаторами.
- [x] Уведомления мастеру о назначенной анкете, кандидату — об отправке анкеты.

### Task 8: PWA и Mini App
- [x] `@vite-pwa/nuxt` (injectManifest), `app/service-worker/sw.ts`: опись сборки, страницы только из сети с запасной `/offline.html`, обработчики `push` и `notificationclick`.
- [x] Манифест: «Школа Актива 2026», значки из бренда (Konkovo на чёрном), `start_url: /cabinet`.
- [x] `/tg`: после входа попросить разрешение писать в личку (`requestWriteAccess`), если его нет.

### Итоговая проверка
- [x] `npm run check` зелёный.
- [x] В браузере: кандидат пишет на сайте → ветка появляется у организатора с отметкой новой → ответ → у кандидата колокольчик и сообщение; доставки в Telegram и пуш — в очереди и уходят/пропускаются по правилам (без токена — пропуск).
