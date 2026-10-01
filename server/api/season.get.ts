import { currentSeason } from "~~/lib/stages";

/**
 * Текущий сезон и состояние этапов. Публичный: лендинг показывает даты,
 * а кабинеты по состоянию решают, какие вкладки под замком.
 */
export default defineEventHandler(async () => {
  return { season: await currentSeason() };
});
