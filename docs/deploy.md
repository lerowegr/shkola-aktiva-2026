# Деплой

Сайт живёт на общем сервере (Ubuntu 22.04, Docker) рядом с двумя десятками
других проектов — в том числе порталом СНиМК, с которого списана схема.
Главное правило: **ничего чужого не трогать**. Свои — только папка
`/root/sha-site`, контейнеры и тома с префиксом `sha-site`, порт
`127.0.0.1:3110`.

## Как обновляется

Пуш в `main` → GitHub Actions (`.github/workflows/deploy.yml`):

1. `npm run check` на своей базе PostgreSQL — красная проверка ничего не везёт;
2. образы `ghcr.io/lerowegr/shkola-aktiva-2026` (сайт) и `…-tools` (миграции,
   сид, бот) — собираются на GitHub, не на сервере: там мало памяти;
3. ssh на сервер ключом, который умеет только одно — запустить
   `/root/sha-site/bin/deploy` (`deploy/bootstrap.sh`). Тот кладёт свежие
   `compose.yml` и скрипты и зовёт `deploy/apply.sh`: образы этой версии →
   миграции → сайт → ждёт здоровья, иначе возвращает прошлую версию.

Заметки (`*.md`, `docs/`, `specs/`) деплой не запускают. Вручную —
«Run workflow» на вкладке Actions.

## На сервере

```
/root/sha-site/
├── compose.yml, deploy/*.sh, docker/backup.sh   — приезжают с каждым деплоем
├── bin/deploy            — вход автодеплоя (ставится один раз)
├── .env.production       — пароли и адреса (chmod 600, только здесь)
├── .deployed, .deployed.prev — текущая и прошлая версия
├── .seeded               — сид уже был (повторно не запускается)
└── .docker/              — свой вход в реестр, общий ~/.docker не трогаем
```

Ручные команды — из `/root/sha-site`, через обёртку (она подставит настройки
и версию):

```bash
./deploy/dc.sh ps
./deploy/dc.sh logs -f app
./deploy/dc.sh exec db psql -U sha sha
./deploy/quick-tunnel.sh --check      # ссылка жива? мёртвую заменит новой
./deploy/quick-tunnel.sh              # новая ссылка принудительно
./deploy/apply.sh "$(sed -n 's/^IMAGE_TAG=//p' .deployed.prev)"   # откат
```

Тестовые входы `admin` / `kandidat` (новые пароли — в
`/root/sha-site/preview-accounts.txt`):

```bash
./deploy/dc.sh run --rm -v /root/sha-site:/out migrate sh -c 'npx tsx scripts/preview-accounts.ts && cp .preview-accounts.txt /out/preview-accounts.txt'
```

Копии базы и файлов — каждую ночь в 06:30 МСК в том `sha-site_backups`,
14 дней. Посмотреть: `./deploy/dc.sh exec backup ls -la /backups`.

## Временный адрес и домен

Пока домена нет, сайт открыт через быстрый туннель Cloudflare
(`*.trycloudflare.com`, строка `TUNNEL=quick` в `.env.production`). Адрес
случайный; при каждом деплое ссылка проверяется и, если умерла, заменяется —
новый адрес печатается в конце лога деплоя.

С доменом:
1. A-запись домена → IP сервера.
2. Сертификат Let's Encrypt — `acme.sh` на сервере (он уже стоит и
   продлевает чужие сертификаты) в `/root/infra/certs/<домен>/`.
3. Свой `server`-блок в `/root/infra/nginx.conf` (общий edge-nginx,
   контейнер `arkadium-edge-nginx`): `proxy_pass http://sha-site-app:3000` —
   сайт уже в сети `arkadium_shared`. Перед правкой — копия
   `nginx.conf.bak-<дата>`, после — `nginx -t` в контейнере и `nginx -s reload`.
4. В `.env.production`: `NUXT_PUBLIC_APP_URL="https://домен"`, строку
   `TUNNEL=quick` убрать; `./deploy/dc.sh up -d --force-recreate app` и
   `./deploy/dc.sh rm -sf tunnel`.

## Первая настройка сервера (один раз)

1. `mkdir -p /root/sha-site/bin` и положить туда `deploy/bootstrap.sh` как
   `bin/deploy` (`chmod 755`).
2. `.env.production` по образцу `deploy/env.production.example`, секреты
   сгенерировать на сервере, `chmod 600`.
3. Ключ деплоя (ed25519, только для этого): открытую часть — в
   `/root/.ssh/authorized_keys` строкой
   `command="/root/sha-site/bin/deploy",restrict ssh-ed25519 AAAA… sha-site deploy`;
   закрытую — в секрет `DEPLOY_SSH_KEY`. `DEPLOY_HOST` — IP сервера,
   `DEPLOY_KNOWN_HOSTS` — вывод `ssh-keyscan -t ed25519 <IP>`.
4. «Run workflow» — первый деплой сам накатит схему и сид.
