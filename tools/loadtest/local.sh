#!/bin/sh
# Локальная копия сайта для нагрузочного теста: боевая сборка (nuxt build)
# на http://localhost:3300 со своей базой sha_load. Ctrl+C — остановить.
set -e
cd "$(dirname "$0")/../.."

export DATABASE_URL="${LOADTEST_LOCAL_DB:-postgresql://egor@localhost:5432/sha_load?schema=public}"
export NUXT_PUBLIC_APP_URL="http://localhost:3300"
export AUTH_SECRET="loadtest-local-only"
export PORT=3300
export NODE_ENV=production

createdb sha_load 2>/dev/null && echo "База sha_load создана." || true
npx prisma migrate deploy
npx tsx prisma/seed.ts
# Сборка — из текущего кода: запоминаем коммит и пересобираем, если код
# изменился (старая сборка мерила бы не тот сайт).
HEAD_NOW="$(git rev-parse HEAD)$(git status --porcelain | shasum | cut -c1-8)"
if [ "$1" = "--rebuild" ] || [ ! -f .output/server/index.mjs ] || [ "$(cat .output/.loadtest-build 2>/dev/null)" != "$HEAD_NOW" ]; then
  echo "Собираю сайт из текущего кода…"
  npm run build
  echo "$HEAD_NOW" > .output/.loadtest-build
fi

echo "Локальная копия: http://localhost:3300"
node .output/server/index.mjs
