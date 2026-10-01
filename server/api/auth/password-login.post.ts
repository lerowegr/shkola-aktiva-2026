import { z } from "zod";

import { normalizeEmail } from "~~/lib/auth/email-code";
import { verifyPassword } from "~~/lib/auth/password";
import { checkThrottle, clearMisses, forgetOldAttempts, recordMiss } from "~~/lib/auth/throttle";
import { db } from "~~/lib/db";
import { startSession } from "~~/server/utils/session";

/**
 * Хеш от пароля, который никому не принадлежит.
 *
 * Нужен, чтобы проверка несуществующего адреса занимала столько же
 * времени, сколько проверка существующего. Без него по разнице во времени
 * ответа снаружи вычитывается, чьи адреса есть в системе.
 */
const ABSENT =
  "scrypt$16$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const schema = z.object({
  email: z.string().trim().min(1, "Введите адрес почты."),
  password: z.string().min(1, "Введите пароль."),
});

/**
 * Вход организатора по паролю.
 *
 * Ответ на неверный пароль, на незнакомый адрес и на адрес без пароля
 * одинаков намеренно. У кандидатов, вошедших по коду из письма, пароля нет,
 * и отдельный текст «пароль не задан» превратил бы эту форму в способ
 * узнать, кто подавался в Школу Актива.
 */
const MISS = "Почта или пароль не подходят. Если вы ещё не задавали пароль — откройте ссылку-приглашение.";

export default defineAction(schema, async ({ body, event }) => {
  const email = normalizeEmail(body.email);
  const ip =
    getRequestHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ?? getRequestIP(event) ?? null;

  // Попутная уборка: таблица промахов растёт сама и не нужна дольше суток.
  await forgetOldAttempts();

  const throttle = await checkThrottle(email);
  if (throttle.blocked) {
    setResponseStatus(event, 429);
    return { ok: false, message: `Слишком много попыток. Попробуйте через ${throttle.minutes} мин.` };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true },
  });

  // Пароль считаем всегда, даже когда считать нечего: см. ABSENT.
  const ok = await verifyPassword(body.password, user?.passwordHash ?? ABSENT);

  if (!ok || !user) {
    await recordMiss(email, ip);
    const after = await checkThrottle(email);

    // Про исчерпанный лимит говорим сразу, а не на следующей попытке.
    if (after.left === 0) {
      return {
        ok: false,
        message: "Почта или пароль не подходят, и попытки закончились. Подождите 15 минут или войдите через Telegram.",
      };
    }

    return {
      ok: false,
      message: after.left <= 2 ? `${MISS} Осталось попыток: ${after.left}.` : MISS,
    };
  }

  if (user.status === "BLOCKED") {
    return { ok: false, message: "Доступ закрыт. Если это ошибка — напишите главному организатору." };
  }

  await clearMisses(email);
  await startSession(event, user.id);

  await audit(event, {
    actorId: user.id,
    action: "auth.password_login",
    entityType: "user",
    entityId: user.id,
  });

  return { ok: true, message: "Здравствуйте!" };
});
