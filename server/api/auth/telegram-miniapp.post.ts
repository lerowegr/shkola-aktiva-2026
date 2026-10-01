import { z } from "zod";

import { checkInitData } from "~~/lib/auth/telegram-init-data";
import { upsertTelegramUser } from "~~/lib/auth/telegram-users";
import { startSession } from "~~/server/utils/session";

/**
 * Вход внутри Telegram: сайт открыли как Mini App.
 *
 * Пароль здесь не нужен: человек уже сидит в своём Telegram, и Telegram
 * подписывает его личность ключом, который знает только наш бот. Подпись
 * и проверяем. Незнакомый Telegram — новый кандидат, а не отказ.
 */
const schema = z.object({ initData: z.string().min(1) });

export default defineAction(schema, async ({ body, event }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    return { ok: false, message: "Вход через Telegram сейчас недоступен." };
  }

  const checked = checkInitData(body.initData, token);

  if (!checked.ok) {
    // Подробности отказа наружу не выносим: для живого человека новость
    // одна — открыть заново, а подбирающему подпись они только помогут.
    return {
      ok: false,
      message:
        checked.reason === "expired"
          ? "Telegram передал устаревшие данные. Закройте приложение и откройте заново."
          : "Telegram не подтвердил, кто вы. Откройте приложение заново из бота.",
    };
  }

  const user = await upsertTelegramUser(checked.user);

  if (user.status === "BLOCKED") {
    return { ok: false, message: "Доступ закрыт. Если это ошибка — напишите организаторам." };
  }

  await startSession(event, user.id);

  await audit(event, {
    actorId: user.id,
    action: "auth.telegram_miniapp",
    entityType: "user",
    entityId: user.id,
  });

  return { ok: true, message: "Здравствуйте!" };
});
