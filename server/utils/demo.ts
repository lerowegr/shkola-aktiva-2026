/**
 * Демо-ручки существуют только на демо-копии. На боевом сайте флага нет —
 * отвечаем 404, будто ручки нет вовсе: вход «как…» не должен быть даже виден.
 */
export function requireDemo(event: Parameters<typeof useRuntimeConfig>[0]) {
  if (useRuntimeConfig(event).public.demo !== true) {
    throw createError({ statusCode: 404, statusMessage: "Страница не найдена." });
  }
}
