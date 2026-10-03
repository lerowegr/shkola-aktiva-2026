# syntax=docker/dockerfile:1

# Сайт и отбор Школы Актива: сборка и запуск. Собирается на GitHub
# (.github/workflows/deploy.yml), сервер образ только скачивает: на нём два
# десятка чужих проектов и около полутора гигабайт свободной памяти, а
# `nuxt build` на пике берёт столько же.
#
# Два образа из одного файла:
#   runtime — сайт: только .output и Node, без исходников и npm;
#   tools   — этаж сборки целиком: Prisma CLI для миграций, tsx для сида,
#             тестовых входов и бота. В боевой образ это не попадает.

# --- Зависимости -------------------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app

# openssl нужен Prisma, ca-certificates — исходящим соединениям (почта, Telegram).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# postinstall зовёт nuxt prepare и prisma generate, а исходников ещё нет.
RUN npm ci --ignore-scripts

# --- Сборка (он же образ tools) ------------------------------------------------
FROM deps AS tools
WORKDIR /app

COPY . .

# Сначала nuxt prepare: tsconfig.json ссылается на .nuxt/tsconfig.json, без
# него Prisma CLI не прочитает prisma.config.ts. На ноутбуке этого не видно —
# там .nuxt лежит с первого запуска dev-сервера.
RUN npx nuxt prepare
# Клиент Prisma генерируется из схемы и в репозитории не лежит.
RUN npx prisma generate
# Шрифты @nuxt/fonts скачиваются здесь и дальше раздаются с нашего адреса.
RUN npm run build

# --- Работа ------------------------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# Файлы кандидатов и фото сайта — в томе: пересборка их не стирает.
ENV UPLOADS_DIR=/data/uploads

COPY --from=tools /app/.output ./.output

RUN mkdir -p /data/uploads && chown -R node:node /data/uploads
USER node

EXPOSE 3000

# Живость — без curl и wget: их в образе нет, а Node есть всегда.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/session').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
