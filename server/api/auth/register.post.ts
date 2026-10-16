import { z } from "zod";

import { registerWithPassword } from "~~/lib/auth/register";
import { startSession } from "~~/server/utils/session";

const schema = z.object({
  login: z.string().max(64),
  password: z.string().max(256),
  repeat: z.string().max(256),
});

/**
 * Регистрация по логину и паролю. Сразу входим — дальше знакомство.
 * Здесь нечего проверять правами: это и есть способ их получить, поэтому
 * защита — лимит на адрес и одинаковые правила с формой.
 */
export default defineAction(schema, async ({ body, event }) => {
  const ip = getRequestHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ?? getRequestIP(event) ?? null;
  const result = await registerWithPassword({ ...body, ip });
  if (!result.ok) {
    if (!result.field) setResponseStatus(event, 429);
    return result;
  }

  await startSession(event, result.userId);
  await audit(event, { actorId: result.userId, action: "auth.register", entityType: "user", entityId: result.userId });
  return { ok: true, message: "Готово! Давай познакомимся." };
});
