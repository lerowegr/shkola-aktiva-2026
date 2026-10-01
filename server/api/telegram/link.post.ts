import { randomBytes } from "node:crypto";

import { z } from "zod";

import { db } from "~~/lib/db";
import { requireSignedIn } from "~~/server/utils/session";

/** Код живёт десять минут: открыть бота и нажать Start. */
const TTL_MS = 10 * 60 * 1000;

/**
 * Привязать Telegram к аккаунту, вошедшему по почте.
 *
 * Сайт даёт ссылку t.me/бот?start=link_<код>; бот по коду узнаёт, к кому
 * привязать этот Telegram. Код — 32 знака: параметр /start не длиннее 64.
 */
export default defineAction(z.object({}), async ({ event }) => {
  const user = await requireSignedIn(event);
  const bot = process.env.NUXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");

  if (!bot) return { ok: false, message: "Бот ещё не подключён — привязка заработает, когда его настроят." };
  if (user.hasTelegram) return { ok: false, message: "Telegram уже привязан." };

  await db.telegramLinkCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const code = randomBytes(24).toString("base64url");
  await db.telegramLinkCode.create({
    data: { code, userId: user.id, expiresAt: new Date(Date.now() + TTL_MS) },
  });

  return { ok: true, link: `https://t.me/${bot}?start=link_${code}` };
});
