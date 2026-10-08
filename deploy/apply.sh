#!/usr/bin/env bash
#
# Поставить версию сайта на сервер:  ./deploy/apply.sh <коммит>
#
# Зовёт bin/deploy при автодеплое с GitHub. Руками — для отката на прошлую
# версию (образ ещё лежит на сервере):
#   ./deploy/apply.sh "$(sed -n 's/^IMAGE_TAG=//p' .deployed.prev)"
#
# Порядок: образы → база → миграции → (первый раз) сид → сайт, бот, копии →
# ждём здоровья сайта. Не поднялся — возвращаем прошлую версию и выходим с
# ошибкой: в GitHub деплой станет красным.
set -euo pipefail
cd "$(dirname "$0")/.."

SHA="${1:?укажите коммит: ./deploy/apply.sh <sha>}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Коммит — 40 шестнадцатеричных знаков, а не «$SHA»" >&2; exit 2; }
ENV=.env.production
[ -f "$ENV" ] || { echo "Нет $ENV — сначала настройте сервер (docs/deploy.md)" >&2; exit 1; }

say() { printf '\n▶ %s\n' "$1"; }

# Свой вход в реестр GitHub: общий ~/.docker/config.json сервера не трогаем —
# там могут быть входы других проектов.
export DOCKER_CONFIG="$PWD/.docker"
mkdir -p "$DOCKER_CONFIG" && chmod 700 "$DOCKER_CONFIG"
if [ -n "${DEPLOY_TOKEN:-}" ]; then
  printf '%s' "$DEPLOY_TOKEN" | docker login ghcr.io -u "${DEPLOY_ACTOR:-github}" --password-stdin >/dev/null
fi

prev=""
[ -f .deployed ] && prev=$(sed -n 's/^IMAGE_TAG=//p' .deployed)

profiles=()
grep -q '^TUNNEL=quick' "$ENV" && profiles=(--profile quick)
printf 'IMAGE_TAG=%s\n' "$SHA" > .deployed.next
dc() { docker compose -p sha-site -f compose.yml --env-file "$ENV" --env-file .deployed.next "${profiles[@]}" "$@"; }

say "Скачиваю версию ${SHA:0:7}"
dc pull --quiet
docker logout ghcr.io >/dev/null 2>&1 || true

say "База и миграции"
dc up -d db
dc run --rm migrate
# Сид на каждом выкате: он только досоздаёт недостающее (новый этап, его
# стартовые критерии) и не трогает правки из админки.
say "Сид: роли, этапы, стартовые критерии"
dc run --rm migrate npx tsx prisma/seed.ts
touch .seeded

say "Запускаю сайт, бота и копии"
dc up -d --remove-orphans app bot backup

status=""
for _ in $(seq 1 45); do
  status=$(docker inspect -f '{{.State.Health.Status}}' sha-site-app-1 2>/dev/null || echo нет)
  [ "$status" = healthy ] && break
  sleep 2
done

if [ "$status" != healthy ]; then
  echo "✖ Сайт не поднялся (состояние: $status). Последние строки лога:" >&2
  dc logs --tail 60 app >&2 || true
  if [ -n "$prev" ] && [ "$prev" != "$SHA" ]; then
    printf 'IMAGE_TAG=%s\n' "$prev" > .deployed.next
    dc up -d app bot
    echo "↩ Вернул прошлую версию ${prev:0:7}" >&2
  fi
  rm -f .deployed.next
  exit 1
fi

if [ -n "$prev" ] && [ "$prev" != "$SHA" ]; then printf 'IMAGE_TAG=%s\n' "$prev" > .deployed.prev; fi
mv .deployed.next .deployed

# Временный адрес: туннель нет — поднять; есть — проверить, что ссылка жива.
if [ ${#profiles[@]} -gt 0 ]; then
  if [ -z "$(docker ps -q -f name='^sha-site-tunnel-1$')" ]; then
    ./deploy/quick-tunnel.sh
  else
    ./deploy/quick-tunnel.sh --check
  fi
fi

# Старые образы сайта — прочь, кроме текущего и прошлого (для отката).
docker image ls --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '^ghcr\.io/lerowegr/shkola-aktiva-2026(-tools)?:' \
  | grep -vE ":(${SHA}|${prev:-none}|latest)$" \
  | xargs -r docker image rm >/dev/null 2>&1 || true

say "Готово: версия ${SHA:0:7}"
grep -o '^NUXT_PUBLIC_APP_URL=.*' "$ENV" | cut -d= -f2- | tr -d '"' | sed 's/^/Сайт: /'
