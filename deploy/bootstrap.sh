#!/usr/bin/env bash
#
# Вход автодеплоя с GitHub. На сервере лежит как /root/sha-site/bin/deploy
# и ставится один раз (docs/deploy.md). В /root/.ssh/authorized_keys ключ
# деплоя привязан к нему:
#
#   command="/root/sha-site/bin/deploy",restrict ssh-ed25519 AAAA… sha-site deploy
#
# Этот ключ не даёт ни оболочки, ни проброса портов — только запуск этого
# файла. Утечёт из GitHub — с ним можно лишь переустановить наш же сайт.
#
# На входе (stdin): коммит, логин GitHub, временный токен реестра (живёт,
# пока идёт сборка) — по строке, дальше tar.gz с compose.yml и скриптами
# деплоя этой версии. Из архива берутся только перечисленные файлы:
# .env.production, тома и чужие папки он тронуть не может.
set -euo pipefail

DIR=/root/sha-site
cd "$DIR"

# Два пуша подряд — два деплоя; второй ждёт первого, а не мешает ему.
exec 9>"$DIR/.deploy.lock"
flock -w 900 9 || { echo "Другой деплой идёт дольше 15 минут" >&2; exit 1; }

read -r SHA
read -r ACTOR
read -r TOKEN
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Неверный коммит" >&2; exit 2; }
[[ "$ACTOR" =~ ^[A-Za-z0-9-]{1,39}$ ]] || { echo "Неверный логин GitHub" >&2; exit 2; }

FILES=(compose.yml deploy/apply.sh deploy/dc.sh deploy/quick-tunnel.sh docker/backup.sh deploy/compose.demo.yml deploy/demo.sh)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tar -xzf - -C "$tmp" "${FILES[@]}"
for file in "${FILES[@]}"; do
  mode=644
  [[ "$file" == *.sh ]] && mode=755
  install -D -m "$mode" "$tmp/$file" "$DIR/$file"
done

DEPLOY_ACTOR="$ACTOR" DEPLOY_TOKEN="$TOKEN" exec "$DIR/deploy/apply.sh" "$SHA"
