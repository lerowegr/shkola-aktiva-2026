import { randomBytes } from "node:crypto";

import { db } from "~~/lib/db";

/** Код живёт пять минут: показать ссылку, нажать Start в боте — и всё. */
const TTL_MS = 5 * 60 * 1000;

/**
 * Выдаёт одноразовый код для входа через Telegram.
 *
 * Без входа: эта ручка и есть начало входа. Код — 192 бита случайности в
 * base64url, 32 знака. Длиннее нельзя: Telegram обрезает параметр /start
 * на 64 знаках, а к коду ещё добавляется «login_». Угадать его нельзя, а
 * жить ему недолго: протухшие чистятся здесь же.
 */
export default defineEventHandler(async () => {
  await db.telegramLoginCode.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const row = await db.telegramLoginCode.create({
    data: {
      code: randomBytes(24).toString("base64url"),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
    select: { code: true },
  });

  return { code: row.code, expiresIn: TTL_MS / 1000 };
});
