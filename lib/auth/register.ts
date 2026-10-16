import { db } from "~~/lib/db";

import { loginProblem, normalizeLogin } from "./login";
import { hashPassword } from "./password";
import { passwordProblem } from "./password-rules";

/**
 * Самостоятельная регистрация кандидата: логин и пароль.
 *
 * Для тех, у кого нет Telegram или кто не хочет входить через него.
 * Дальше — как у всех: знакомство (/cabinet/welcome), анкета, тест.
 *
 * Регистраций с одного адреса — не больше 20 в час: на внутренних тестах
 * весь этаж сидит за одним Wi-Fi, а скрипту, плодящему аккаунты, этого мало.
 * Счётчик — в той же таблице попыток входа, под отдельным ключом.
 */
export const REGISTRATIONS_PER_HOUR = 20;

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; field?: "login" | "password" | "repeat"; message: string };

export async function registerWithPassword(input: {
  login: string;
  password: string;
  repeat: string;
  ip: string | null;
}): Promise<RegisterResult> {
  const login = normalizeLogin(input.login);
  const badLogin = loginProblem(login);
  if (badLogin) return { ok: false, field: "login", message: badLogin };

  const badPassword = passwordProblem(input.password);
  if (badPassword) return { ok: false, field: "password", message: badPassword };
  if (input.password.toLowerCase().includes(login)) {
    return { ok: false, field: "password", message: "Пароль повторяет логин — его угадают с первой попытки." };
  }
  if (input.password !== input.repeat) return { ok: false, field: "repeat", message: "Пароли не совпадают — введите ещё раз." };

  const key = `register:${input.ip ?? "unknown"}`;
  const recent = await db.loginAttempt.count({ where: { email: key, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= REGISTRATIONS_PER_HOUR) {
    return { ok: false, message: "С этого адреса слишком много регистраций за час. Попробуйте позже или войдите через Telegram." };
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({ data: { login, passwordHash }, select: { id: true } });
    await db.loginAttempt.create({ data: { email: key, ip: input.ip } });
    return { ok: true, userId: user.id };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, field: "login", message: "Такой логин уже занят — придумайте другой." };
    }
    throw error;
  }
}
