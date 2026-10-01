import { loadSiteContent } from "~~/lib/site/store";
import { DEFAULT_CONTENT } from "~~/lib/site/content";
import { currentSeason } from "~~/lib/stages";

/**
 * Всё для лендинга одним запросом: тексты и этапы с датами и состоянием.
 * Публичный — главная открыта всем.
 */
export default defineEventHandler(async () => {
  const season = await currentSeason();
  return {
    season,
    content: season ? await loadSiteContent(season.id) : DEFAULT_CONTENT,
  };
});
