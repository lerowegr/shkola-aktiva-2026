import { db } from "~~/lib/db";

/** Текущий сезон или честный 404 — без сезона кабинетам показывать нечего. */
export async function requireCurrentSeasonId(): Promise<string> {
  const season = await db.season.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!season) throw createError({ statusCode: 404, statusMessage: "Сезон ещё не заведён." });
  return season.id;
}
