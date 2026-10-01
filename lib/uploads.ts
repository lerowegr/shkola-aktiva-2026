import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "~~/lib/db";

/**
 * Загруженные файлы — домашние задания в PDF.
 *
 * Лежат в UPLOADS_DIR (по умолчанию ./uploads), а не в public/: это
 * личные работы, и раздаёт их только обработчик с проверкой прав. Имя на
 * диске — случайное: по нему нельзя ни угадать чужой файл, ни подсунуть
 * путь вида ../../etc. Настоящее имя хранится в базе и отдаётся заголовком.
 *
 * Тип проверяем по содержимому, а не по расширению: PDF начинается с
 * «%PDF-». Переименованный exe с расширением .pdf сюда не пройдёт.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function uploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? "uploads");
}

export function isPdf(data: Uint8Array): boolean {
  return data.length >= 5 && Buffer.from(data.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** Имя для показа: без путей и управляющих символов, не длиннее 120 знаков. */
export function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(-120);
  const named = cleaned || "работа.pdf";
  return /\.pdf$/i.test(named) ? named : `${named}.pdf`;
}

export type SaveResult = { ok: true; uploadId: string } | { ok: false; message: string };

export async function savePdf(params: { userId: string; filename: string; data: Uint8Array }): Promise<SaveResult> {
  if (params.data.length === 0) return { ok: false, message: "Файл пустой." };
  if (params.data.length > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Файл больше 20 МБ. Сожмите PDF или уберите лишние картинки." };
  }
  if (!isPdf(params.data)) return { ok: false, message: "Нужен файл PDF. Сохраните работу в PDF и загрузите ещё раз." };

  const storageKey = `${randomBytes(16).toString("hex")}.pdf`;
  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(path.join(uploadsDir(), storageKey), params.data);

  const upload = await db.upload.create({
    data: {
      userId: params.userId,
      filename: cleanFilename(params.filename),
      mime: "application/pdf",
      size: params.data.length,
      storageKey,
    },
    select: { id: true },
  });

  return { ok: true, uploadId: upload.id };
}

export async function readUpload(id: string) {
  const upload = await db.upload.findUnique({ where: { id } });
  if (!upload) return null;
  // Ключ создаём сами, но проверим ещё раз: путь не выходит из папки.
  const file = path.join(uploadsDir(), path.basename(upload.storageKey));
  try {
    return { upload, data: await readFile(file) };
  } catch {
    return null;
  }
}

export async function removeUpload(id: string) {
  const upload = await db.upload.delete({ where: { id } }).catch(() => null);
  if (upload) await unlink(path.join(uploadsDir(), path.basename(upload.storageKey))).catch(() => null);
}
