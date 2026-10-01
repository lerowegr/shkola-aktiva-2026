import { z } from "zod";

import { db } from "~~/lib/db";
import { startSession } from "~~/server/utils/session";

const schema = z.object({ code: z.string().min(1) });

/**
 * Вход по подтверждённому в боте коду.
 *
 * Личность уже доказана там: бот узнал человека по привязанному Telegram
 * и записал userId в код. Здесь проверяем, что код живой и неизрасходован,
 * гасим его и заводим обычную сессию — дальше сайт не различает, как
 * человек вошёл.
 */
export default defineAction(schema, async ({ body, event }) => {
  const row = await db.telegramLoginCode.findUnique({
    where: { code: body.code },
    select: { userId: true, expiresAt: true, consumedAt: true },
  });

  if (!row || row.consumedAt || row.expiresAt < new Date() || !row.userId) {
    return { ok: false, message: "Код устарел. Получите новый." };
  }

  const user = await db.user.findUnique({
    where: { id: row.userId },
    select: { id: true, status: true },
  });

  if (!user || user.status === "BLOCKED") {
    return { ok: false, message: "Доступ закрыт. Если это ошибка — напишите организаторам." };
  }

  // Гасим код условием consumedAt: null — два одновременных запроса с одним
  // кодом не заведут две сессии: второй увидит, что код уже израсходован.
  const { count } = await db.telegramLoginCode.updateMany({
    where: { code: body.code, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (count === 0) return { ok: false, message: "Код устарел. Получите новый." };

  await startSession(event, user.id);

  await audit(event, {
    actorId: user.id,
    action: "auth.telegram_login",
    entityType: "user",
    entityId: user.id,
  });

  return { ok: true, message: "Здравствуйте!" };
});
