import { DEFAULT_CONTENT } from "~~/lib/site/content";
import { loadSiteContent } from "~~/lib/site/store";
import { currentSeason } from "~~/lib/stages";

/**
 * Всё для лендинга одним запросом: тексты и этапы с датами и состоянием.
 * Публичный — главная открыта всем. Размеры фото не нужны: на главной фото
 * стоят в рамках фиксированных пропорций и обрезаются по центру.
 */
export default defineEventHandler(async () => {
  const season = await currentSeason();
  return {
    season,
    content: season ? await loadSiteContent(season.id) : DEFAULT_CONTENT,
  };
});
