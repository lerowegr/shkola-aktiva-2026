import { readFile } from "node:fs/promises";

import { avatarFile } from "~~/lib/profile/avatar";
import { db } from "~~/lib/db";

/**
 * Файл аватарки по ключу. Публичный маршрут: ключи случайные, по ним
 * человека не перебрать. Вечный кеш — ключ меняется с каждой загрузкой.
 */
export default defineEventHandler(async (event) => {
  const key = String(getRouterParam(event, "key") ?? "");
  if (!/^[0-9a-f]{32}$/.test(key)) throw createError({ statusCode: 404, statusMessage: "Нет такой аватарки." });
  const owner = await db.user.findFirst({ where: { avatarKey: key }, select: { id: true } });
  if (!owner) throw createError({ statusCode: 404, statusMessage: "Нет такой аватарки." });
  try {
    const data = await readFile(avatarFile(key));
    setResponseHeader(event, "Content-Type", "image/webp");
    setResponseHeader(event, "Cache-Control", "public, max-age=31536000, immutable");
    return data;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Нет такой аватарки." });
  }
});
