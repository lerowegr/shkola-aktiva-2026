import { z } from "zod";

/**
 * Сообщения zod по-русски. Там, где схема не задала свой текст, наружу
 * уходило английское «Invalid input: …» — интерфейс у нас весь на русском.
 */
export default defineNitroPlugin(() => {
  z.config(z.locales.ru());
});
