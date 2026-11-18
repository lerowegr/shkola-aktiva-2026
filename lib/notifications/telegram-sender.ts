import { Api, InlineKeyboard } from "grammy";

import { PARENT_CONSENT } from "../participation/form";
import { parentConsentFile } from "../participation/parent-consent";

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
  const slot = message.url?.match(/^\/staff\/interviews\?botSlot=([a-zA-Z0-9-]{1,40})$/)?.[1];
  if (slot) return new InlineKeyboard().text("Открыть собеседование / ответить", `iv:slot:${slot}`);
  if (message.url === "/cabinet/interview") return new InlineKeyboard().text("Собеседование в боте", "ivc:menu");
  if (!message.url || !base.startsWith("https://")) return undefined;
  const label = message.attachment === "parentConsent" ? "Открыть анкету" : "Открыть";
  return new InlineKeyboard().webApp(label, miniAppLink(message.url, base));
}

export function createTelegramSender(): Senders["telegram"] {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;

  const api = new Api(token);
  const base = appUrl();

  return async (chatId, message) => {
    const text = telegramText(message, base);
    const replyMarkup = telegramButton(message, base);
    if (message.attachment === "parentConsent") {
      const document = await parentConsentFile();
      const caption = `${text}\n\n${PARENT_CONSENT.caption}`;
      // В подписи к документу Telegram принимает до 1024 символов.
      if (caption.length <= 1024) {
        await api.sendDocument(chatId, document, { caption, parse_mode: "HTML", reply_markup: replyMarkup });
      } else {
        await api.sendMessage(chatId, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: replyMarkup });
        await api.sendDocument(chatId, document, { caption: PARENT_CONSENT.caption });
      }
      return;
    }
    await api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: replyMarkup,
    });
  };
}
