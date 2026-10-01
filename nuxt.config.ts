import tailwindcss from "@tailwindcss/vite";

/**
 * Настройка Nuxt для платформы Школы Актива.
 *
 * Ядро — права, вход, этапы, уведомления — живёт в корневой папке lib и не
 * знает ни про Nuxt, ни про Vue. Поэтому в импортах внутри него стоит «~~»,
 * который в Nuxt всегда означает корень проекта: «~» здесь занят папкой app.
 */
export default defineNuxtConfig({
  compatibilityDate: "2026-09-28",
  devtools: { enabled: true },

  // Tailwind 4 настраивается прямо в CSS через @theme, конфига нет.
  vite: { plugins: [tailwindcss()] },
  css: ["~/assets/css/main.css"],

  modules: ["@nuxt/eslint", "@nuxt/fonts", "@vite-pwa/nuxt"],

  typescript: { typeCheck: false, strict: true },

  runtimeConfig: {
    public: {
      appUrl: "http://localhost:3000",
      // Без собачки. Читается из NUXT_PUBLIC_TELEGRAM_BOT_USERNAME при запуске.
      telegramBotUsername: "",
      // Открытая половина ключа пушей — браузер подписывается ею.
      vapidPublicKey: "",
    },
  },

  // Кабинеты и вход поисковикам не нужны — ни в выдаче, ни в индексе.
  routeRules: {
    "/cabinet/**": { headers: { "X-Robots-Tag": "noindex" } },
    "/staff/**": { headers: { "X-Robots-Tag": "noindex" } },
    "/login": { headers: { "X-Robots-Tag": "noindex" } },
    "/invite/**": { headers: { "X-Robots-Tag": "noindex" } },
    "/tg": { headers: { "X-Robots-Tag": "noindex" } },
  },

  nitro: {
    // Prisma — нативный модуль, в бандл его не запихнуть.
    externals: { external: ["@prisma/client"] },
  },

  /*
   * Шрифты брендбука. Модуль скачивает файлы на сборке и раздаёт их с нашего
   * домена, без походов в Google у посетителя.
   *
   * Отсюда — только открытые шрифты. Cormorant — шрифт брендбука как есть.
   * Inter — замена SF Pro для Android и Windows: SF Pro по лицензии Apple
   * нельзя выкладывать на сайт, а на устройствах Apple он и так системный
   * (см. --font-sans в main.css).
   *
   * Konkovo, Retrogression и Bickham Script One — не из Google: они лежат в
   * public/fonts и подключаются через @font-face в main.css.
   */
  fonts: {
    provider: "google",
    families: [
      {
        name: "Cormorant",
        provider: "google",
        weights: [400, 500, 600, 700],
        styles: ["normal", "italic"],
        subsets: ["latin", "cyrillic"],
      },
      { name: "Inter", provider: "google", weights: [400, 500, 600, 700], subsets: ["latin", "cyrillic"] },
    ],
  },

  /*
   * PWA: устанавливаемое приложение и пуши. Воркер написан руками
   * (app/service-worker/sw.ts) — там же объяснено, почему страницы и ответы
   * ручек не кешируются.
   */
  pwa: {
    strategies: "injectManifest",
    srcDir: "service-worker",
    filename: "sw.ts",
    // Обновление — с согласия: человек может стоять посреди анкеты.
    registerType: "prompt",
    manifest: {
      name: "Школа Актива 2026",
      short_name: "Школа Актива",
      description: "Отбор в Школу Актива: анкета, задания, собеседование и новости.",
      lang: "ru",
      dir: "ltr",
      start_url: "/cabinet",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#252525",
      theme_color: "#252525",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "Анкета", url: "/cabinet/application" },
        { name: "Сообщения", url: "/cabinet/messages" },
      ],
    },
    injectManifest: {
      globPatterns: ["**/*.{js,css,svg,png,ico,woff2}", "offline.html"],
      // three.js (~0,5 МБ) нужен только главной. Без предела его скачивал бы
      // каждый, кто ставит приложение ради кабинета.
      maximumFileSizeToCacheInBytes: 300 * 1024,
    },
    // Файл больше предела — не ошибка сборки, а «не класть в кеш» (three.js).
    showMaximumFileSizeToCacheInBytesWarning: true,
    client: {
      // Раз в час проверяем обновление у тех, кто неделями не закрывает вкладку.
      periodicSyncForUpdates: 3600,
    },
    devOptions: {
      // В разработке воркер мешает: правки приходят из кеша. Включить для
      // проверки пушей — NUXT_PWA_DEV=1 npm run dev.
      enabled: process.env.NUXT_PWA_DEV === "1",
      type: "module",
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: "ru" },
      link: [
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon.png" },
      ],
      titleTemplate: "%s — Школа Актива",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "description", content: "Школа Актива 2026: о проекте, программа, роли, место и регистрация." },
        { name: "theme-color", content: "#252525" },
        // На айфоне без этого установленное приложение не получает пуши.
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Школа Актива" },
      ],
    },
  },
});
