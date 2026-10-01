import { db } from "~~/lib/db";
import type { Prisma } from "~~/lib/generated/prisma/client";

import { mergeContent, SECTION_KEYS, type SectionKey, type SiteContent } from "./content";

/** Тексты сайта на сезон: из базы поверх значений по умолчанию. */
export async function loadSiteContent(seasonId: string): Promise<SiteContent> {
  const row = await db.siteContent.findUnique({ where: { seasonId }, select: { data: true } });
  return mergeContent(row?.data);
}

/**
 * Сохранить тексты целиком. Возвращает разделы, которые изменились, —
 * для журнала: «поменяли вопросы» читается лучше, чем «сохранили сайт».
 */
export async function saveSiteContent(
  seasonId: string,
  content: SiteContent,
  actorId: string,
): Promise<{ changed: SectionKey[] }> {
  const before = await loadSiteContent(seasonId);
  const changed = SECTION_KEYS.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(content[key]));
  if (changed.length === 0) return { changed };

  const data = content as unknown as Prisma.InputJsonObject;
  await db.siteContent.upsert({
    where: { seasonId },
    create: { seasonId, data, updatedById: actorId },
    update: { data, updatedById: actorId },
  });
  return { changed };
}
