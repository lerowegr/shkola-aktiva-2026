import { z } from "zod";

import { verifyEmailCode } from "~~/lib/auth/email-code";
import { startSession } from "~~/server/utils/session";

const schema = z.object({
  email: z.email("Проверьте адрес почты — в нём ошибка."),
  code: z.string().min(1, "Введите код из письма."),
});

const MESSAGES = {
  wrong: "Код не подходит. Проверьте цифры в письме.",
  expired: "Код устарел. Запросите новый.",
  too_many: "Слишком много неверных попыток. Запросите новый код.",
  blocked: "Доступ закрыт. Если это ошибка — напишите организаторам.",
} as const;

/** Второй шаг входа по почте: проверить код и впустить. */
export default defineAction(schema, async ({ body, event }) => {
  const result = await verifyEmailCode(body.email, body.code);

  if (!result.ok) return { ok: false, message: MESSAGES[result.reason] };

  await startSession(event, result.userId);

  await audit(event, {
    actorId: result.userId,
    action: "auth.email_login",
    entityType: "user",
    entityId: result.userId,
  });

  return { ok: true, message: "Здравствуйте!" };
});
