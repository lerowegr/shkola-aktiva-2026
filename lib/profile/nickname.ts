import { db } from "~~/lib/db";

import type { AdminResult } from "../admin/roles";
import { nicknameError, normalizeNickname } from "./display";

/**
 * Свой ник: проверка, уникальность без учёта регистра, пауза между сменами.
 *
 * Пауза — чтобы рейтинг не рябил от переименований: менять можно раз в 7
 * дней, первая установка — всегда. Сброс staff — в people (с аудитом).
 */
const CHANGE_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;

export async function setNickname(userId: string, nickname: string, now = new Date()): Promise<AdminResult> {
  const problem = nicknameError(nickname);
  if (problem) return { ok: false, message: problem };
  const trimmed = nickname.trim();
  const norm = normalizeNickname(trimmed);

  const user = await db.user.findUnique({ where: { id: userId }, select: { nicknameNorm: true, nicknameChangedAt: true } });
  if (!user) return { ok: false, message: "Войдите заново." };
  if (user.nicknameNorm === norm) return { ok: true };

  if (user.nicknameChangedAt && now.getTime() - user.nicknameChangedAt.getTime() < CHANGE_PAUSE_MS) {
    return { ok: false, message: "Ник можно менять раз в 7 дней." };
  }
  const taken = await db.user.findUnique({ where: { nicknameNorm: norm }, select: { id: true } });
  if (taken && taken.id !== userId) return { ok: false, message: "Этот ник уже занят." };

  await db.user.update({ where: { id: userId }, data: { nickname: trimmed, nicknameNorm: norm, nicknameChangedAt: now } });
  return { ok: true };
}

/** Сброс ника организатором (против самозванцев). */
export async function resetNickname(userId: string): Promise<AdminResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true } });
  if (!user) return { ok: false, message: "Человек не найден." };
  if (!user.nickname) return { ok: false, message: "Ника и так нет." };
  await db.user.update({ where: { id: userId }, data: { nickname: null, nicknameNorm: null, nicknameChangedAt: null } });
  return { ok: true };
}
