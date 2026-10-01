/**
 * Поисковикам — только публичная часть. Кабинеты, вход и обработчики им
 * не нужны; заголовок X-Robots-Tag на них стоит в nuxt.config.
 * Нейросетевые поисковики не закрыты: пусть отвечают про Школу по сайту.
 */
export default defineEventHandler((event) => {
  const url = useRuntimeConfig(event).public.appUrl.replace(/\/$/, "");
  setHeader(event, "Content-Type", "text/plain; charset=utf-8");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /cabinet",
    "Disallow: /staff",
    "Disallow: /login",
    "Disallow: /invite/",
    "Disallow: /tg",
    "Disallow: /api/",
    "",
    `Sitemap: ${url}/sitemap.xml`,
    "",
  ].join("\n");
});
