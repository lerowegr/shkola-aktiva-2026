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
├── .seeded               — сид был (он идёт на каждом выкате и только досоздаёт недостающее)
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

Новый пароль человеку (владельцу или организатору без приглашения),
печатается один раз:

```bash
./deploy/dc.sh run --rm -T migrate npx tsx scripts/set-password.ts почта
```

Копии базы и файлов — каждую ночь в 06:30 МСК в том `sha-site_backups`,
14 дней. Посмотреть: `./deploy/dc.sh exec backup ls -la /backups`.

## Домен

Сайт — https://schoolofactivity.ru (DNS в Beget: A-записи `@` и `www` →
82.22.38.111). Подключён 2026-10-08:

- Сертификат Let's Encrypt выпущен `acme.sh` (webroot
  `/root/infra/certs/acme-webroot`), лежит в `/root/infra/certs/schoolofactivity/`,
  продлевается кроном acme.sh сам и перезагружает edge-nginx.
- Блоки `server` в конце `/root/infra/nginx.conf` (общий edge-nginx,
  контейнер `arkadium-edge-nginx`): :80 — проверка Let's Encrypt и редирект
  на https, :443 — `proxy_pass http://sha-site-app:3000`, `www` → без `www`.
  Перед правкой — копия `nginx.conf.bak-<дата>`, после — `nginx -t` в
  контейнере и `nginx -s reload`.
- В `.env.production`: `NUXT_PUBLIC_APP_URL="https://schoolofactivity.ru"`,
  строки `TUNNEL=quick` нет — деплой туннель не поднимает.

Временный туннель (`deploy/quick-tunnel.sh`, `TUNNEL=quick`) остался на
случай, если домен отвалится: вернуть строку и задеплоить.

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

## Демо-копия

https://demo.schoolofactivity.ru — тот же код, своя база (`/root/sha-demo`,
compose-проект `sha-demo`, `deploy/compose.demo.yml`, подсеть 10.204.0.0/24).
Включена `NUXT_PUBLIC_DEMO=true`: на /login — «Войти как…» (организаторы и
кандидаты на разных этапах, без паролей), сверху полоса «Демо-версия» с
кнопкой «Сбросить демо». Ни бота, ни пушей, ни копий — уведомления остаются
в колокольчике. Сценарий — `lib/demo/scenario.ts`.

- Обновляется каждым выкатом той же версией (`deploy/demo.sh up` из
  `apply.sh`; сбой демо боевой выкат не валит).
- Пересоздать демо-отбор: `/root/sha-site/deploy/demo.sh reset`.
- Настройки — `/root/sha-demo/.env.demo` (chmod 600).
- nginx: блоки `demo.schoolofactivity.ru` в конце `/root/infra/nginx.conf`,
  сертификат — `/root/infra/certs/sha-demo/` (acme.sh продлевает сам).
