import { z } from "zod";

import { checkInvite } from "~~/lib/auth/invite";

const query = z.object({ token: z.string().min(1) });

const REASONS = {
  not_found: "Приглашение не найдено. Проверьте, что ссылка скопирована целиком.",
  used: "По этой ссылке пароль уже задан. Войдите на странице входа или попросите новое приглашение.",
  expired: "Приглашение устарело — оно действует неделю. Попросите новое у главного организатора.",
} as const;

/** Страница приглашения спрашивает, живо ли оно и для кого. */
export default defineEventHandler(async (event) => {
  const parsed = query.safeParse(getQuery(event));
  if (!parsed.success) return { ok: false as const, message: REASONS.not_found };

  const check = await checkInvite(parsed.data.token);
  if (!check.ok) return { ok: false as const, message: REASONS[check.reason] };

  return { ok: true as const, email: check.email, name: check.name };
});
