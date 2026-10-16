#!/usr/bin/env bash
#
# Демо-копия сайта (deploy/compose.demo.yml). Версия — та же, что у боевого.
#
#   demo.sh up      поднять или обновить: миграции, сид, сайт; в первый раз — демо-отбор
#   demo.sh reset   пересоздать демо-отбор с нуля
#   demo.sh ps|logs …  — как docker compose
#
# Настройки — /root/sha-demo/.env.demo (POSTGRES_PASSWORD, DATABASE_URL,
# AUTH_SECRET, NUXT_PUBLIC_APP_URL, NUXT_PUBLIC_DEMO=true). Без файла — тихо
# ничего не делает: демо не обязано быть на каждом сервере.
set -euo pipefail
SITE=/root/sha-site
DEMO=/root/sha-demo
[ -f "$DEMO/.env.demo" ] || { echo "Демо не настроено ($DEMO/.env.demo нет) — пропускаю."; exit 0; }

TAG=$(sed -n 's/^IMAGE_TAG=//p' "$SITE/.deployed")
dc() { IMAGE_TAG="$TAG" docker compose -p sha-demo -f "$SITE/deploy/compose.demo.yml" --env-file "$DEMO/.env.demo" "$@"; }
reset() { dc run --rm -T -e DEMO_RESET_CONFIRM=1 migrate npx tsx scripts/demo-reset.ts; }

case "${1:-up}" in
  up)
    dc up -d db
    dc run --rm -T migrate
    dc run --rm -T migrate npx tsx prisma/seed.ts
    if [ ! -f "$DEMO/.seeded" ]; then reset && touch "$DEMO/.seeded"; fi
    dc up -d app
    ;;
  reset) reset ;;
  *) dc "$@" ;;
esac
