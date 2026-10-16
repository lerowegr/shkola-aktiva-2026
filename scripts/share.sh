#!/usr/bin/env bash
#
# Показать сайт по временной ссылке Cloudflare — с этого компьютера.
#
#   npm run share
#
# Собирает сайт, поднимает туннель Cloudflare (адрес *.trycloudflare.com,
# аккаунт не нужен) и запускает сервер с этим адресом. Войти — по паролю
# или зарегистрироваться логином на /login.
#
# Ссылка живёт, пока работает эта команда и компьютер не спит (сон на время
# работы запрещён, но закрытая крышка всё равно усыпит). Каждый запуск —
# новый адрес. Остановить — Ctrl+C.
#
# Пропустить сборку, если код не менялся: SKIP_BUILD=1 npm run share
# Другой порт: PORT=3200 npm run share
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3100}"
TUNNEL_PID=""
SERVER_PID=""

stop() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap stop EXIT INT TERM

fail() {
  echo "✖ $1" >&2
  exit 1
}

command -v cloudflared >/dev/null || fail "Нет cloudflared. Поставьте: brew install cloudflared"
[ -f .env ] || fail "Нет файла .env. Скопируйте .env.example в .env и заполните."
[ -d node_modules ] || fail "Не установлены зависимости. Запустите: npm install"
if command -v pg_isready >/dev/null && ! pg_isready -q; then
  fail "База не отвечает. Запустите PostgreSQL: brew services start postgresql@16"
fi
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Порт $PORT занят — похоже, сайт уже запущен. Остановите прежний запуск или: PORT=3200 npm run share"
fi

if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "→ Собираю сайт (около минуты)…"
  npx nuxt build >/dev/null || fail "Сборка не прошла. Подробности: npx nuxt build"
fi
[ -f .output/server/index.mjs ] || fail "Нет собранного сайта. Запустите без SKIP_BUILD=1."

echo "→ Поднимаю туннель Cloudflare…"
TUNNEL_LOG="$(mktemp)"
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

URL=""
for _ in $(seq 1 40); do
  # api.trycloudflare.com — служебный адрес из журнала cloudflared, не ссылка на сайт.
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | grep -v '^https://api\.' | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || fail "Cloudflare не выдал ссылку. Проверьте интернет; журнал туннеля: $TUNNEL_LOG"

# Адрес туннеля — адрес сайта: по нему проверяется, что запрос пришёл со
# своей страницы, и решается, какой будет кука сессии.
PORT="$PORT" NUXT_PUBLIC_APP_URL="$URL" \
  node --env-file=.env .output/server/index.mjs &
SERVER_PID=$!

# Пока сервер работает, компьютер не засыпает сам.
command -v caffeinate >/dev/null && caffeinate -i -w "$SERVER_PID" &

for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 1
done

cat <<INFO

  ✔ Сайт открыт: $URL
    Вход:        $URL/login — по паролю или «Регистрация»

  Ссылка работает, пока открыто это окно. Остановить — Ctrl+C.

INFO

wait "$SERVER_PID"
