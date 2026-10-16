import { z } from "zod";

import { hashPassword } from "~~/lib/auth/password";
import { passwordProblem } from "~~/lib/auth/password-rules";
import { db } from "~~/lib/db";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({ password: z.string().max(256), repeat: z.string().max(256) });

/**
 * Свой пароль вместо временного из бота (или просто новый). Временный
 * после этого больше не действует.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { login: true, email: true } });

  const problem = passwordProblem(body.password, { email: row.email });
  if (problem) return { ok: false, field: "password", message: problem };
  if (row.login && body.password.toLowerCase().includes(row.login)) {
    return { ok: false, field: "password", message: "Пароль повторяет логин — его угадают с первой попытки." };
  }
  if (body.repeat !== body.password) return { ok: false, field: "repeat", message: "Пароли не совпадают." };

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(body.password),
      passwordSetAt: new Date(),
      tempPasswordHash: null,
      tempPasswordExpiresAt: null,
      mustChangePassword: false,
    },
  });
  await audit(event, { actorId: user.id, action: "auth.password_change", entityType: "user", entityId: user.id });
  return { ok: true, message: "Пароль сохранён." };
});
