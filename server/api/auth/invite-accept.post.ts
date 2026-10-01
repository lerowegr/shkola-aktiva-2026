import { z } from "zod";

import { acceptInvite } from "~~/lib/auth/invite";
import { startSession } from "~~/server/utils/session";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1, "Придумайте пароль."),
});

const REASONS = {
  not_found: "Приглашение не найдено. Проверьте, что ссылка скопирована целиком.",
  used: "По этой ссылке пароль уже задан. Войдите на странице входа.",
  expired: "Приглашение устарело. Попросите новое у главного организатора.",
} as const;

/** Организатор задаёт пароль по приглашению и сразу входит. */
export default defineAction(schema, async ({ body, event }) => {
  const result = await acceptInvite(body.token, body.password);

  if (!result.ok) {
    return { ok: false, message: result.reason === "weak" ? result.message : REASONS[result.reason] };
  }

  await startSession(event, result.userId);

  await audit(event, {
    actorId: result.userId,
    action: "invite.accept",
    entityType: "user",
    entityId: result.userId,
  });

  return { ok: true, message: "Пароль задан. Добро пожаловать!" };
});
