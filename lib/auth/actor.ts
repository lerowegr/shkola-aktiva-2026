import { db } from "~~/lib/db";
import type { Actor } from "~~/lib/permissions";

/**
 * Текущий человек вместе с его правами.
 *
 * Здесь только сборка объекта по идентификатору. Откуда взялся сам
 * идентификатор — из куки сессии, из теста — этот файл не знает: он про
 * права, а не про транспорт.
 */
export interface CurrentUser extends Actor {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Как обращаться в интерфейсе: «Имя Фамилия», или ник, или почта. */
  name: string;
  telegramUsername: string | null;
  hasTelegram: boolean;
  status: "ACTIVE" | "BLOCKED";
  /** Есть хоть одно право или владелец — значит, пускаем в кабинет организатора. */
  isStaff: boolean;
  /** Кандидат ещё не прошёл знакомство (/cabinet/welcome): кабинет закрыт. */
  needsProfile: boolean;
  /** Вошёл временным паролем из бота — сначала задать свой (/password). */
  mustChangePassword: boolean;
}

export function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  telegramUsername: string | null;
  email: string | null;
}): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.telegramUsername) return `@${user.telegramUsername}`;
  return user.email ?? "Без имени";
}

export async function loadUser(userId: string | null | undefined): Promise<CurrentUser | null> {
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      telegramId: true,
      telegramUsername: true,
      status: true,
      isOwner: true,
      onboardedAt: true,
      mustChangePassword: true,
      roles: { select: { role: { select: { permissions: true } } } },
    },
  });

  if (!user) return null;

  const permissions = [...new Set(user.roles.flatMap((item) => item.role.permissions))];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: displayName(user),
    telegramUsername: user.telegramUsername,
    hasTelegram: user.telegramId !== null,
    status: user.status,

    isOwner: user.isOwner,
    isActive: user.status === "ACTIVE",
    permissions,
    isStaff: user.isOwner || permissions.length > 0,
    needsProfile: !(user.isOwner || permissions.length > 0) && user.onboardedAt === null,
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * Отказ в правах.
 *
 * Поля statusCode и statusMessage — не украшение: по ним h3 понимает, что
 * это осмысленный отказ, а не поломка сервера. Без них ошибка превращалась
 * бы в 500 «внутренняя ошибка» и пустой экран вместо объяснения.
 */
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly statusMessage: string;
  readonly fatal = false;
  readonly data: { message: string };

  constructor(message = "Недостаточно прав для этого действия.") {
    super(message);
    this.name = "ForbiddenError";
    this.statusMessage = message;
    this.data = { message };
  }
}
