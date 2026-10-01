import { readFile } from "node:fs/promises";

import { db } from "~~/lib/db";
import { IMAGE_WIDTHS, imageFile, type ImageWidth } from "~~/lib/site/images";

/**
 * Фото сайта: /media/site/<id>/<ширина>.webp.
 *
 * Публично — это фото лендинга. Содержимое по id никогда не меняется
 * (новое фото — новый id), поэтому кеш вечный: браузер и будущий прокси
 * больше не спрашивают.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const width = Number(/^(\d+)\.webp$/.exec(getRouterParam(event, "file") ?? "")?.[1]);
  if (!IMAGE_WIDTHS.includes(width as ImageWidth) || !/^[a-z0-9]{20,40}$/.test(id)) {
    throw createError({ statusCode: 404, statusMessage: "Фото не найдено." });
  }

  const image = await db.siteImage.findUnique({ where: { id }, select: { storageKey: true } });
  const data = image ? await readFile(imageFile(image.storageKey, width as ImageWidth)).catch(() => null) : null;
  if (!data) throw createError({ statusCode: 404, statusMessage: "Фото не найдено." });

  setHeaders(event, {
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  return data;
});
