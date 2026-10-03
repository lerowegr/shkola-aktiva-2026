#!/usr/bin/env bash
#
# Временный адрес *.trycloudflare.com — поднять заново и прописать сайту.
#
#   ./deploy/quick-tunnel.sh          — новый адрес (старая ссылка умрёт)
#   ./deploy/quick-tunnel.sh --check  — живая ссылка остаётся, мёртвая заменяется
#
# Адрес выдаёт Cloudflare, узнать его заранее нельзя, а сайту он нужен при
# старте: от него зависят имя куки сессии (на https — __Secure-) и проверка,
# откуда пришёл запрос. Поэтому: туннель → адрес из лога → .env.production →
# пересоздать сайт. Быстрые туннели иногда умирают молча (cloudflared жив, а
# ссылка отдаёт ошибку) — тогда --check заменит адрес.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV=.env.production
DC=./deploy/dc.sh

current=$(grep -o '^NUXT_PUBLIC_APP_URL=.*' "$ENV" | cut -d= -f2- | tr -d '"' || true)

if [ "${1:-}" = "--check" ] && [[ "$current" == https://*.trycloudflare.com ]]; then
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$current/api/session" || true)
  if [ "$code" = 200 ]; then
    echo "Ссылка жива: $current"
    exit 0
  fi
  echo "Ссылка $current не отвечает (код $code) — поднимаю новую."
fi

# Пересоздаём принудительно: у старого туннеля в логе остался бы старый адрес.
$DC up -d --force-recreate --no-deps tunnel

url=""
for _ in $(seq 1 40); do
  # -a: в логе cloudflared есть управляющие символы, без него grep решит,
  # что поток двоичный, и ничего не найдёт.
  url=$($DC logs tunnel 2>/dev/null | grep -ao 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)
  [ -n "$url" ] && break
  sleep 2
done
[ -n "$url" ] || { echo "Туннель не выдал адрес. Смотрите: ./deploy/dc.sh logs tunnel" >&2; exit 1; }

if grep -q '^NUXT_PUBLIC_APP_URL=' "$ENV"; then
  sed -i "s|^NUXT_PUBLIC_APP_URL=.*|NUXT_PUBLIC_APP_URL=\"$url\"|" "$ENV"
else
  printf 'NUXT_PUBLIC_APP_URL="%s"\n' "$url" >> "$ENV"
fi

# Адрес приходит переменной окружения — без пересоздания сайт его не увидит.
$DC up -d --force-recreate --no-deps app
echo "Сайт по ссылке: $url"
