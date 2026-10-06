import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { uploadsDir } from "~~/lib/uploads";

/**
 * Аватарки: квадрат 256 webp без метаданных. Только загрузка — импорта
 * из Telegram нет по решению владельца.
 */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 256;

export function avatarsDir(): string {
  return path.join(uploadsDir(), "avatars");
}

export function avatarFile(storageKey: string): string {
  return path.join(avatarsDir(), `${storageKey}.webp`);
}

export const AVATAR_ERRORS = {
  tooBig: "Фото больше 5 МБ — выберите поменьше.",
  notImage: "Это не фото. Подойдут JPEG, PNG или WebP.",
} as const;

export type AvatarResult = { ok: true; storageKey: string } | { ok: false; message: string };

export async function processAvatar(data: Uint8Array): Promise<AvatarResult> {
  if (data.length > AVATAR_MAX_BYTES) return { ok: false, message: AVATAR_ERRORS.tooBig };
  let image: Buffer;
  try {
    image = await sharp(data, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, message: AVATAR_ERRORS.notImage };
  }
  const storageKey = randomBytes(16).toString("hex");
  await mkdir(avatarsDir(), { recursive: true });
  await writeFile(avatarFile(storageKey), image);
  return { ok: true, storageKey };
}

export async function deleteAvatarFiles(storageKey: string): Promise<void> {
  await rm(avatarFile(storageKey), { force: true });
}
