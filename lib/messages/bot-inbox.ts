import type { TelegramWebAppUser } from "~~/lib/auth/telegram-init-data";
import { upsertTelegramUser } from "~~/lib/auth/telegram-users";
import { db } from "~~/lib/db";

import { postMessage, threadFor } from "./threads";

/**
 * Человек написал боту — это сообщение организаторам.
 *
 * Бот подтверждает получение, но не на каждое сообщение: человек часто
 * пишет тремя сообщениями подряд, и три одинаковых «получили» — шум.
 * Подтверждение — не чаще раза в полчаса в одной переписке.
 */
export const ACK_EVERY_MS = 30 * 60 * 1000;
export const ACK_TEXT = "Спасибо, сообщение получили — организаторы ответят здесь же.";

export type InboxResult = { ok: true; reply: string | null } | { ok: false; reply: string };

export async function receiveFromTelegram(tg: TelegramWebAppUser, text: string, now = new Date()): Promise<InboxResult> {
  const season = await db.season.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!season) return { ok: false, reply: "Отбор ещё не начался — напишите чуть позже." };

  const user = await upsertTelegramUser(tg);
  if (user.status === "BLOCKED") return { ok: false, reply: "Доступ закрыт. Если это ошибка — напишите организаторам." };

  const thread = await threadFor(season.id, user.id);
  await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: user.id, text, via: "TELEGRAM", now });

  const recentAck = await db.message.findFirst({
    where: { threadId: thread.id, author: "BOT", createdAt: { gt: new Date(now.getTime() - ACK_EVERY_MS) } },
    select: { id: true },
  });
  if (recentAck) return { ok: true, reply: null };

  await postMessage({ threadId: thread.id, author: "BOT", authorId: null, text: ACK_TEXT, via: "TELEGRAM", now });
  return { ok: true, reply: ACK_TEXT };
}
