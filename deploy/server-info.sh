#!/usr/bin/env bash
#
# Снимок сервера перед деплоем: что стоит, что запущено, какие порты
# заняты, сколько места. ТОЛЬКО ЧИТАЕТ — ничего не ставит, не меняет и не
# перезапускает. Пароли, ключи и файлы .env не печатает.
#
# Запуск с ноутбука (под root):
#   ssh root@АДРЕС 'bash -s' < deploy/server-info.sh > deploy/server-info.txt
# Под обычным пользователем с sudo:
#   scp deploy/server-info.sh ПОЛЬЗОВАТЕЛЬ@АДРЕС:/tmp/ && ssh -t ПОЛЬЗОВАТЕЛЬ@АДРЕС 'sudo bash /tmp/server-info.sh > /tmp/server-info.txt 2>&1' && scp ПОЛЬЗОВАТЕЛЬ@АДРЕС:/tmp/server-info.txt deploy/
#
# Результат — deploy/server-info.txt (в репозиторий не попадает).
set +e
export LC_ALL=C

section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
# Команды, которым нужен root: без пароля через sudo -n, иначе пропуск.
asroot() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif sudo -n true 2>/dev/null; then sudo -n "$@"
  else echo "(нужен root — пропущено: $*)"
  fi
}
ver() { have "$1" && { printf '%-16s ' "$1"; "$@" 2>&1 | head -1; } || printf '%-16s нет\n' "$1"; }

section "Система"
hostname
grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release 2>/dev/null
uname -srm
have systemd-detect-virt && echo "виртуализация: $(systemd-detect-virt)"
uptime
have timedatectl && timedatectl 2>/dev/null | grep -E 'Time zone|synchronized|NTP'
echo "локаль: ${LANG:-нет}"

section "Ресурсы"
echo "ядер: $(nproc)"
free -h
swapon --show 2>/dev/null
df -hT -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null
df -i / | tail -1

section "Пользователь и SSH"
echo "я: $(whoami) | $(id)"
if [ "$(id -u)" = 0 ]; then echo "root"; elif sudo -n true 2>/dev/null; then echo "sudo без пароля: да"; else echo "sudo без пароля: нет"; fi
grep -hEi '^\s*(Port|PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|AllowUsers)\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
echo "пользователи с оболочкой:"; awk -F: '$7 ~ /(ba|z|)sh$/ {print "  " $1 " (" $6 ")"}' /etc/passwd

section "Сеть"
echo "внешний IPv4: $(curl -4 -s -m 5 https://api.ipify.org || echo нет)"
echo "внешний IPv6: $(curl -6 -s -m 5 https://api64.ipify.org || echo нет)"
echo "--- слушающие порты:"
asroot ss -tulpn 2>/dev/null || ss -tuln
echo "--- файрвол:"
have ufw && asroot ufw status verbose
have firewall-cmd && asroot firewall-cmd --list-all
have nft && asroot nft list ruleset 2>/dev/null | grep -cE 'accept|drop|reject' | sed 's/^/правил nftables: /'
have iptables && asroot iptables -S 2>/dev/null | head -30
have fail2ban-client && asroot fail2ban-client status

section "Программы"
ver docker --version
ver docker compose version
ver node --version
ver npm --version
ver pnpm --version
[ -d "$HOME/.nvm" ] && echo "nvm              есть ($HOME/.nvm)"
ver git --version
ver nginx -v
ver apache2 -v
ver httpd -v
ver caddy version
ver traefik version
ver psql --version
ver redis-server --version
ver pm2 --version
ver certbot --version
ver cloudflared --version
ver python3 --version
ver gcc --version
ver make --version

section "Запущенные сервисы"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'
echo "--- упавшие:"
systemctl --failed --no-pager --no-legend 2>/dev/null
echo "--- таймеры:"
systemctl list-timers --no-pager --no-legend 2>/dev/null | awk '{print $(NF-1), $NF}'

section "Docker"
if have docker; then
  asroot docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  asroot docker compose ls 2>/dev/null
  asroot docker network ls
  asroot docker volume ls
  asroot docker system df
else echo "docker не установлен"; fi

section "PM2"
have pm2 && pm2 list 2>/dev/null || echo "pm2 нет"

section "Веб-серверы (только адреса и порты, без содержимого)"
if [ -d /etc/nginx ]; then
  echo "--- nginx, включённые сайты:"
  ls -la /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
  asroot grep -rhE '^\s*(listen|server_name|root|proxy_pass)\b' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | sed 's/^\s*/  /' | sort | uniq -c
fi
[ -f /etc/caddy/Caddyfile ] && { echo "--- Caddyfile, адреса сайтов:"; grep -E '^\S.*\{' /etc/caddy/Caddyfile; }
have apache2ctl && asroot apache2ctl -S 2>/dev/null | head -20

section "Сертификаты"
[ -d /etc/letsencrypt/live ] && asroot ls /etc/letsencrypt/live || echo "letsencrypt: нет"
have certbot && asroot certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry'

section "PostgreSQL"
have pg_lsclusters && pg_lsclusters
if have psql && id postgres >/dev/null 2>&1; then
  asroot su postgres -c "psql -Atc 'select version()'" 2>/dev/null
  echo "--- базы (имя | владелец | кодировка | размер):"
  asroot su postgres -c "psql -Atc \"select datname, pg_get_userbyid(datdba), pg_encoding_to_char(encoding), pg_size_pretty(pg_database_size(datname)) from pg_database where not datistemplate\"" 2>/dev/null
  echo "--- русская сортировка ICU (ru-RU):"
  asroot su postgres -c "psql -Atc \"select count(*) from pg_collation where collname like 'ru-RU%'\"" 2>/dev/null
fi

section "Каталоги"
for dir in /opt /srv /var/www /home /root; do
  [ -d "$dir" ] && { echo "--- $dir"; asroot ls -la "$dir" 2>/dev/null | tail -n +2; }
done

section "Cron"
echo "--- crontab $(whoami):"; crontab -l 2>/dev/null || echo "пусто"
[ "$(id -u)" != 0 ] && { echo "--- crontab root:"; asroot crontab -l 2>/dev/null || echo "пусто"; }
ls /etc/cron.d 2>/dev/null

section "Доступ наружу"
for url in https://github.com https://ghcr.io https://registry.npmjs.org https://api.telegram.org https://acme-v02.api.letsencrypt.org/directory https://www.cloudflare.com; do
  printf '%-48s %s\n' "$url" "$(curl -s -o /dev/null -m 8 -w '%{http_code} за %{time_total}с' "$url" || echo недоступен)"
done

section "Готово"
date -u
