import { createHash, randomBytes } from "node:crypto";

import { db } from "~~/lib/db";

import { hashPassword } from "./password";
import { passwordProblem } from "./password-rules";

/**
 * Приглашения организаторов.
 *
 * Вместо таблицы логинов и паролей, которая расходится по чатам, — личная
 * ссылка. По ней человек сам задаёт пароль, и никто, кроме него, этот
 * пароль не видел. Ссылка одноразовая и живёт неделю.
 *
 * В базе — хеш токена, а не сам токен: утечка таблицы не даёт перехватить
 * ещё не принятые приглашения.
 */
export const INVITE_TTL_DAYS = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvite(
  userId: string,
  createdById: string | null,
): Promise<{ token: string }> {
  const token = randomBytes(32).toString("base64url");

  await db.$transaction([
    // Действует только последняя ссылка: переотправленное приглашение
    // закрывает старое, которое могло уйти не туда.
    db.staffInvite.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    db.staffInvite.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        createdById,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  return { token };
}

export type InviteCheck =
  | { ok: true; userId: string; email: string | null; name: string | null }
  | { ok: false; reason: "not_found" | "used" | "expired" };

export async function checkInvite(token: string): Promise<InviteCheck> {
  const invite = await db.staffInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      userId: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { email: true, firstName: true, lastName: true, status: true } },
    },
  });

  if (!invite || invite.user.status === "BLOCKED") return { ok: false, reason: "not_found" };
  if (invite.usedAt) return { ok: false, reason: "used" };
  if (invite.expiresAt <= new Date()) return { ok: false, reason: "expired" };

  const name = [invite.user.firstName, invite.user.lastName].filter(Boolean).join(" ") || null;
  return { ok: true, userId: invite.userId, email: invite.user.email, name };
}

export type AcceptResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "used" | "expired" | "weak"; message?: string };

export async function acceptInvite(token: string, password: string): Promise<AcceptResult> {
  const check = await checkInvite(token);
  if (!check.ok) return check;

  const problem = passwordProblem(password, { email: check.email });
  if (problem) return { ok: false, reason: "weak", message: problem };

  const passwordHash = await hashPassword(password);

  // Гасим приглашение условием usedAt: null — второе принятие той же
  // ссылки, даже одновременное, не перезапишет уже заданный пароль.
  const { count } = await db.staffInvite.updateMany({
    where: { tokenHash: hashToken(token), usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: "used" };

  await db.user.update({
    where: { id: check.userId },
    data: { passwordHash, passwordSetAt: new Date() },
  });

  return { ok: true, userId: check.userId };
}
