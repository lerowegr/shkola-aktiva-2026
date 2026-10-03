#!/usr/bin/env bash
#
# docker compose сайта с нужными файлами настроек — на сервере, из любой папки.
#
#   ./deploy/dc.sh ps
#   ./deploy/dc.sh logs -f app
#   ./deploy/dc.sh exec db psql -U sha sha
#
# .env.production — пароли и адреса, .deployed — версия (IMAGE_TAG), которую
# поставил последний деплой. Без обёртки легко запустить compose без версии
# и откатить сайт на «latest».
set -euo pipefail
cd "$(dirname "$0")/.."

files=(--env-file .env.production)
[ -f .deployed ] && files+=(--env-file .deployed)

profiles=()
grep -q '^TUNNEL=quick' .env.production 2>/dev/null && profiles+=(--profile quick)

exec docker compose -p sha-site -f compose.yml "${files[@]}" "${profiles[@]}" "$@"
