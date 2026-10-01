/** Публичная страница одна — главная. */
export default defineEventHandler((event) => {
  const url = useRuntimeConfig(event).public.appUrl.replace(/\/$/, "");
  setHeader(event, "Content-Type", "application/xml; charset=utf-8");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${url}/</loc><changefreq>weekly</changefreq></url>
</urlset>
`;
});
