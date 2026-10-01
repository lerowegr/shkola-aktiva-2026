import { db } from "~~/lib/db";
import type { Prisma } from "~~/lib/generated/prisma/client";

import { mergeContent, photoIds, SECTION_KEYS, type SectionKey, type SiteContent } from "./content";
import { deleteImageFiles } from "./images";

/** Тексты сайта на сезон: из базы поверх значений по умолчанию. */
export async function loadSiteContent(seasonId: string): Promise<SiteContent> {
  const row = await db.siteContent.findUnique({ where: { seasonId }, select: { data: true } });
  return mergeContent(row?.data);
}

/** Фото без ссылок живут час: загрузил, но ещё не сохранил — не потеряется. */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

export type SaveSiteResult =
  | { ok: true; changed: SectionKey[]; removedImages: number }
  | { ok: false; message: string };

/**
 * Сохранить тексты целиком. Возвращает разделы, которые изменились, —
 * для журнала: «поменяли вопросы» читается лучше, чем «сохранили сайт».
 *
 * Ссылки на фото проверяются: на сайте не должно быть дырок вместо фото.
 * После сохранения убираются фото сезона, на которые больше никто не
 * ссылается, — иначе диск копит заменённые и удалённые снимки.
 */
export async function saveSiteContent(
  seasonId: string,
  content: SiteContent,
  actorId: string,
  now = new Date(),
): Promise<SaveSiteResult> {
  const ids = photoIds(content);
  if (ids.length) {
    const found = await db.siteImage.count({ where: { seasonId, id: { in: ids } } });
    if (found !== ids.length) return { ok: false, message: "Фото не найдено — загрузите его заново." };
  }

  const before = await loadSiteContent(seasonId);
  const changed = SECTION_KEYS.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(content[key]));

  if (changed.length) {
    const data = content as unknown as Prisma.InputJsonObject;
    await db.siteContent.upsert({
      where: { seasonId },
      create: { seasonId, data, updatedById: actorId },
      update: { data, updatedById: actorId },
    });
  }

  const orphans = await db.siteImage.findMany({
    where: { seasonId, id: { notIn: ids }, createdAt: { lt: new Date(now.getTime() - ORPHAN_GRACE_MS) } },
    select: { id: true, storageKey: true },
  });
  for (const orphan of orphans) await deleteImageFiles(orphan.storageKey);
  if (orphans.length) await db.siteImage.deleteMany({ where: { id: { in: orphans.map((item) => item.id) } } });

  return { ok: true, changed, removedImages: orphans.length };
}

/** Размеры фото — для srcset и пропорций без прыжков макета. */
export async function imagesMeta(
  seasonId: string,
  ids?: string[],
): Promise<Record<string, { width: number; height: number }>> {
  const rows = await db.siteImage.findMany({
    where: { seasonId, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, width: true, height: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, { width: row.width, height: row.height }]));
}
