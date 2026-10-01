import { z } from "zod";

import { db } from "~~/lib/db";

const query = z.object({ code: z.string().min(1) });

/**
 * Ждёт ли код подтверждения в боте.
 *
 * Страница входа опрашивает раз в пару секунд. Отвечаем только фактом:
 * сам код и есть секрет, а знает его лишь тот, кому мы его выдали.
 */
export default defineEventHandler(async (event) => {
  const { code } = query.parse(getQuery(event));

  const row = await db.telegramLoginCode.findUnique({
    where: { code },
    select: { userId: true, expiresAt: true, consumedAt: true },
  });

  if (!row || row.consumedAt || row.expiresAt < new Date()) {
    return { done: false, expired: true as const };
  }

  return { done: row.userId !== null, expired: false as const };
});
