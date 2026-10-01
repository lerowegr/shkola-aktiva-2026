import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp, { type OutputInfo } from "sharp";

import { uploadsDir } from "~~/lib/uploads";

/**
 * Фото для лендинга: проверить, уменьшить, сохранить варианты.
 *
 * Фото с телефона весит 3–5 МБ — главная с десятками таких не откроется на
 * мобильном интернете. Поэтому храним не исходник, а webp-варианты под
 * ширину экрана (480, 960, 1600) и «мастер» до 2400 px — на случай, если
 * понадобятся другие размеры.
 *
 * Декодирование заодно проверяет, что это вообще изображение. Метаданные
 * (EXIF, в том числе координаты съёмки) выбрасываются: фото уходит на
 * публичный сайт.
 */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const IMAGE_WIDTHS = [480, 960, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];
const MASTER_SIZE = 2400;

export function siteImagesDir(): string {
  return path.join(uploadsDir(), "site");
}

export function imageFile(storageKey: string, width: ImageWidth | "master"): string {
  return path.join(siteImagesDir(), `${storageKey}-${width}.webp`);
}

/** Контейнер HEIC (ISO BMFF): «ftyp» и марка HEVC-изображения. */
function isHeic(data: Uint8Array): boolean {
  if (data.length < 12) return false;
  const box = Buffer.from(data.subarray(4, 8)).toString("latin1");
  const brand = Buffer.from(data.subarray(8, 12)).toString("latin1");
  return box === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand);
}

export const IMAGE_ERRORS = {
  tooBig: "Фото больше 15 МБ — уменьшите его или выберите другое.",
  heic: "Фото в формате HEIC — сохраните его как JPEG (на iPhone: Настройки → Камера → Форматы → Наиболее совместимый).",
  notImage: "Это не фото. Подойдут JPEG, PNG или WebP.",
} as const;

export type ProcessResult =
  | { ok: true; storageKey: string; width: number; height: number; bytes: number }
  | { ok: false; message: string };

export async function processImage(data: Uint8Array): Promise<ProcessResult> {
  if (data.length > MAX_IMAGE_BYTES) return { ok: false, message: IMAGE_ERRORS.tooBig };

  let master: { data: Buffer; info: OutputInfo };
  try {
    master = await sharp(data, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MASTER_SIZE, height: MASTER_SIZE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Открыть не вышло: HEIC без декодера или вовсе не картинка.
    return { ok: false, message: isHeic(data) ? IMAGE_ERRORS.heic : IMAGE_ERRORS.notImage };
  }

  const variants = await Promise.all(
    IMAGE_WIDTHS.map(async (width) => ({
      width,
      data: await sharp(master.data).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    })),
  );

  const storageKey = randomBytes(16).toString("hex");
  await mkdir(siteImagesDir(), { recursive: true });
  await writeFile(imageFile(storageKey, "master"), master.data);
  for (const variant of variants) await writeFile(imageFile(storageKey, variant.width), variant.data);

  return {
    ok: true,
    storageKey,
    width: master.info.width,
    height: master.info.height,
    bytes: master.data.length + variants.reduce((sum, variant) => sum + variant.data.length, 0),
  };
}

export async function deleteImageFiles(storageKey: string): Promise<void> {
  await Promise.all(
    [...IMAGE_WIDTHS, "master" as const].map((width) => rm(imageFile(storageKey, width), { force: true })),
  );
}
