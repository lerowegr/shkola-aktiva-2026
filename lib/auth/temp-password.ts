import { randomInt } from "node:crypto";

import { writeAudit } from "~~/lib/audit";
import { db } from "~~/lib/db";

import { hashPassword, verifyPassword } from "./password";

/**
 * «Забыли пароль?» — временный пароль из бота.
 *
 * Сайт отправляет человека в бота: Telegram уже знает, кто это, и пароль
 * приходит в его личные сообщения. Пароль живёт 24 часа, в базе — только
 * хеш. Войдя им, человек сначала задаёт свой пароль (mustChangePassword).
 * Обычный пароль при этом продолжает работать: вспомнил — входит как раньше.
 */
export const TEMP_PASSWORD_HOURS = 24;
// Без похожих знаков (0/o, 1/l/i): пароль переписывают руками с телефона.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type IssueResult =
  | { ok: true; password: string; signIn: string; staff: boolean; expiresAt: Date }
  | { ok: false; reason: "no_account" | "no_credentials" | "blocked" };

export async function issueTempPassword(telegramId: string, now = new Date()): Promise<IssueResult> {
  const user = await db.user.findUnique({
    where: { telegramId },
    select: {
      id: true,
      status: true,
      login: true,
      email: true,
      isOwner: true,
      roles: { select: { role: { select: { permissions: true } } } },
    },
  });
  if (!user) return { ok: false, reason: "no_account" };
  if (user.status === "BLOCKED") return { ok: false, reason: "blocked" };
  const signIn = user.login ?? user.email;
  if (!signIn) return { ok: false, reason: "no_credentials" };

  const password = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const expiresAt = new Date(now.getTime() + TEMP_PASSWORD_HOURS * 60 * 60 * 1000);
  await db.user.update({
    where: { id: user.id },
    data: { tempPasswordHash: await hashPassword(password), tempPasswordExpiresAt: expiresAt },
  });
  await writeAudit({ actorId: user.id, action: "auth.temp_password", entityType: "user", entityId: user.id, meta: { via: "telegram" } });

  const staff = user.isOwner || user.roles.some((item) => item.role.permissions.length > 0);
  return { ok: true, password, signIn, staff, expiresAt };
}

/** Подходит ли временный пароль: есть, не истёк, совпадает. */
export async function tempPasswordMatches(
  user: { tempPasswordHash: string | null; tempPasswordExpiresAt: Date | null },
  plain: string,
  now = new Date(),
): Promise<boolean> {
  if (!user.tempPasswordHash || !user.tempPasswordExpiresAt || user.tempPasswordExpiresAt <= now) return false;
  return verifyPassword(plain, user.tempPasswordHash);
}
