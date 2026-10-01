import { Api, InlineKeyboard } from "grammy";

import type { OutgoingMessage, Senders } from "./worker";

/**
 * Отправка уведомлений ботом.
 *
 * Кнопка «Открыть» — это и есть канал «Mini App»: она открывает сайт
 * внутри Telegram сразу на нужном экране, а вход происходит сам по подписи
 * Telegram (/tg?to=…). Кнопка Web App работает только по https, поэтому
 * локально вместо неё — адрес строкой.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function appUrl(): string {
  return (process.env.NUXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function telegramText(message: OutgoingMessage, base: string): string {
  const lines = [`<b>${escapeHtml(message.title)}</b>`];
  if (message.body) lines.push(escapeHtml(message.body));
  if (message.url && !base.startsWith("https://")) lines.push(escapeHtml(absolute(message.url, base)));
  return lines.join("\n\n");
}

function absolute(url: string, base: string): string {
  return url.startsWith("/") ? `${base}${url}` : url;
}

/** Ссылка, которая откроет нужный экран внутри Telegram. */
export function miniAppLink(url: string, base: string): string {
  const path = url.startsWith(base) ? url.slice(base.length) || "/" : url;
  return path.startsWith("/") ? `${base}/tg?to=${encodeURIComponent(path)}` : path;
}

export function telegramButton(message: OutgoingMessage, base: string): InlineKeyboard | undefined {
  if (!message.url || !base.startsWith("https://")) return undefined;
  return new InlineKeyboard().webApp("Открыть", miniAppLink(message.url, base));
}

export function createTelegramSender(): Senders["telegram"] {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;

  const api = new Api(token);
  const base = appUrl();

  return async (chatId, message) => {
    await api.sendMessage(chatId, telegramText(message, base), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: telegramButton(message, base),
    });
  };
}
