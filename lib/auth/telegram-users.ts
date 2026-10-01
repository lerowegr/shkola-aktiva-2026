import { db } from "~~/lib/db";

import type { TelegramWebAppUser } from "./telegram-init-data";

/**
 * Человек по его Telegram.
 *
 * Незнакомый Telegram — не отказ, а новый кандидат: регистрация на ША и
 * есть первый вход. Имя берём из Telegram только при создании — дальше
 * человек правит его сам в анкете, и повторный вход не должен затирать
 * исправленное. Ник обновляем всегда: его меняют, а писать по старому
 * бессмысленно.
 *
 * upsert по уникальному telegramId, а не «найти, потом создать»: два
 * одновременных входа (бот и Mini App) иначе завели бы двух людей.
 */
export async function upsertTelegramUser(
  tg: TelegramWebAppUser,
): Promise<{ id: string; status: "ACTIVE" | "BLOCKED" }> {
  return db.user.upsert({
    where: { telegramId: tg.id },
    create: {
      telegramId: tg.id,
      telegramUsername: tg.username,
      firstName: tg.firstName,
      lastName: tg.lastName,
    },
    update: { telegramUsername: tg.username },
    select: { id: true, status: true },
  });
}

export type ConfirmResult = { ok: true; userId: string } | { ok: false; reason: "stale" | "blocked" };

/**
 * Бот подтверждает код входа, который показал сайт.
 *
 * Сайт выдал код и ждёт; человек нажал Start в боте с этим кодом — значит,
 * этот Telegram и есть тот, кто сидит у браузера. Записываем, кто он,
 * а сессию заведёт уже сайт, увидев userId.
 */
export async function confirmLoginCode(code: string, tg: TelegramWebAppUser): Promise<ConfirmResult> {
  const row = await db.telegramLoginCode.findUnique({
    where: { code },
    select: { expiresAt: true, consumedAt: true },
  });

  if (!row || row.consumedAt || row.expiresAt < new Date()) {
    return { ok: false, reason: "stale" };
  }

  const user = await upsertTelegramUser(tg);
  if (user.status === "BLOCKED") return { ok: false, reason: "blocked" };

  await db.telegramLoginCode.update({
    where: { code },
    data: { telegramId: tg.id, userId: user.id },
  });

  return { ok: true, userId: user.id };
}

export type LinkResult =
  | { ok: true; name: string | null }
  | { ok: false; reason: "stale" | "taken" | "blocked" };

/**
 * Привязать Telegram к аккаунту, вошедшему по почте.
 *
 * Если этот Telegram уже принадлежит другому аккаунту — например,
 * человек раньше входил через бота, а потом зарегистрировался по почте, —
 * молча переносить нельзя: у старого аккаунта может быть своя анкета.
 * Отказываем с объяснением, а слияние делают организаторы руками.
 */
export async function linkTelegram(code: string, tg: TelegramWebAppUser): Promise<LinkResult> {
  const row = await db.telegramLinkCode.findUnique({
    where: { code },
    select: { userId: true, expiresAt: true, consumedAt: true, user: { select: { status: true, firstName: true, telegramId: true } } },
  });

  if (!row || row.consumedAt || row.expiresAt < new Date()) return { ok: false, reason: "stale" };
  if (row.user.status === "BLOCKED") return { ok: false, reason: "blocked" };

  if (row.user.telegramId !== tg.id) {
    const owner = await db.user.findUnique({ where: { telegramId: tg.id }, select: { id: true } });
    if (owner && owner.id !== row.userId) return { ok: false, reason: "taken" };
  }

  const { count } = await db.telegramLinkCode.updateMany({
    where: { code, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: "stale" };

  await db.user.update({
    where: { id: row.userId },
    data: { telegramId: tg.id, telegramUsername: tg.username },
  });

  return { ok: true, name: row.user.firstName };
}
