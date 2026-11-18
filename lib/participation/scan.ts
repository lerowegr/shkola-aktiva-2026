import type { Prisma } from "~~/lib/generated/prisma/client";
import { db } from "~~/lib/db";

import { shaAccepted } from "./store";

export const maxScanBytes = 8 * 1024 * 1024;


function pendingScan(telegramId: string) {
  return {
    submittedAt: null,
    application: {
      ...shaAccepted,
      season: { isCurrent: true },
      user: { telegramId, status: "ACTIVE" },
    },
  } satisfies Prisma.ParticipationWhereInput;
}

export async function canReceiveScan(telegramId: string) {
  return Boolean(await db.participation.count({ where: pendingScan(telegramId) }));
}

export async function saveConsentScan(telegramId: string, bytes: Buffer) {
  const starts = (prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  const mime = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : starts([0xff, 0xd8, 0xff]) ? "image/jpeg"
    : starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? "image/png"
    : null;

  if (!mime || bytes.length > maxScanBytes) {
    return "Пришли подписанное заявление в формате PDF, JPG или PNG размером до 8 МБ.";
  }
  const result = await db.participation.updateMany({
    where: pendingScan(telegramId),
    data: { consentScan: Uint8Array.from(bytes), scanMime: mime },
  });
  return result.count ? "Заявление принято. Вернись в анкету на сайте, проверь получение файла и отправь анкету." : "Анкета закрыта или ещё не открылась.";
}
