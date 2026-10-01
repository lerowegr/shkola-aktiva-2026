# Implementation Plan: Доработки лендинга по отзыву

**Branch**: `001-landing-polish` (без отдельной ветки) | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-landing-polish/spec.md`

## Summary

Десять доработок главной по отзыву владельца: выразительная плашка «Подать заявку» (первый
экран и финал), нет выделения текста при игре с 3D, лента «Люди Школы» с фото-слайдерами,
программа карточками-перевёртышами, история таймлайном на весь экран, фото места,
перебивка «сборка логотипа», анимации вопросов, маскоты со следящими глазами в финале,
значки Telegram и ВК в подвале. Главное техническое добавление — фото сайта: загрузка в
админке, обработка `sharp` в webp-варианты, раздача с вечным кешем; тексты ссылаются на фото
по id. Решения и отвергнутые варианты — в [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 24; Vue 3.5 SFC

**Primary Dependencies**: Nuxt 4 (Nitro), Prisma 7 (PostgreSQL 16), three.js 0.186, GSAP 3.15
(ScrollTrigger), Tailwind 4, zod 4. Новые: `sharp` 0.35 (обработка фото), `simple-icons`
(значки Telegram/ВК, только два пути).

**Storage**: PostgreSQL — `SiteContent.data` (JSON-документ текстов) и новая таблица
`site_images`; файлы фото — `UPLOADS_DIR/site/`.

**Testing**: Vitest (база `sha_test`) — схема текстов, проверка ссылок на фото, уборка,
обработка изображений, «осталось N дней», выбор последних событий истории; ручная проверка
в браузере по [quickstart.md](quickstart.md).

**Target Platform**: браузеры телефонов и компьютеров (Chrome, Safari iOS 16+, Firefox), Telegram
Mini App; сервер — Node на Linux (будущий VPS) и macOS (разработка).

**Project Type**: веб-приложение Nuxt (фронтенд и сервер в одном проекте).

**Performance Goals**: первый экран главной не медленнее текущего (SC-005); фото грузятся по
мере приближения, телефону — вариант 480/960 px; анимации 60 к/с на среднем телефоне.

**Constraints**: 375px без горизонтальной прокрутки; «уменьшить движение» — без анимаций;
вторая 3D-сцена создаётся только у видимой области; одна текстовая бегущая строка на
странице; исходник фото до 15 МБ.

**Scale/Scope**: до 60 людей по 8 фото, 12 фото места, 40 событий истории — до ~550 фото
на сезон (~0,2 МБ на фото во всех вариантах — ~110 МБ на диске).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Проверка | Итог |
|---|---|---|
| I. Права на сервере | Загрузка и сохранение — `requirePermission("content.manage")`; сохранение через `defineAction`; загрузка multipart — вне `defineAction`, как ДЗ (обоснование в Complexity Tracking), origin-проверка общая | ✅ |
| II. Журнал | `content.image_upload` на загрузку, `content.update` с разделами и числом убранных фото | ✅ |
| III. Честный отбор | Отбор не затрагивается; «осталось N дней» считается из даты этапа, а не хранится | ✅ |
| IV. Данные и секреты | Файлы вне `public/`, раздаются маршрутом; EXIF (в том числе GPS) вырезается при обработке; фото людей публикуют только организаторы | ✅ |
| V. Русский, Москва, телефон | Тексты и ошибки по-русски; «осталось N дней» по Москве; 375px и «уменьшить движение» — в сценариях проверки | ✅ |
| VI. Проверка | Правила — в чистых модулях с тестами; `npm run check`; ручные сценарии quickstart | ✅ |
| Ограничения | Стек тот же; не выдумываем людей и факты (демо — с пометкой «пример»); новых внешних сервисов нет | ✅ |

**После дизайна (Phase 1)**: нарушений нет; два отступления зафиксированы ниже.

## Project Structure

### Documentation (this feature)

```text
specs/001-landing-polish/
├── plan.md              # этот файл
├── research.md          # решения R1–R13
├── data-model.md        # SiteImage, PhotoRef, people, venue.photos, history.photo
├── quickstart.md        # сценарии проверки
├── contracts/http.md    # обработчики и UI-контракты
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
prisma/schema.prisma                    # + SiteImage
lib/site/
├── content.ts                          # схема: PhotoRef, people вместо roles, venue.photos, history.photo
├── store.ts                            # проверка ссылок на фото, уборка после сохранения
├── images.ts                           # sharp: проверка, варианты webp, удаление файлов
└── landing.ts                          # чистые помощники: последние события, «осталось N дней»
server/api/admin/site/images.post.ts    # загрузка фото
server/api/admin/site.get.ts            # + images
server/api/site.get.ts                  # + images
server/routes/media/site/[id]/[file].ts # раздача вариантов
app/components/admin/
├── PhotoList.vue                       # загрузка, порядок, подписи, удаление фото
app/pages/staff/admin/site.vue          # «Люди», фото места, фото событий истории
app/landing/
├── voxel-scene.ts                      # + режим «сборка» для перебивки
├── mascot-eyes.ts                      # координаты глаз маскотов
app/components/landing/
├── CtaPanel.vue                        # плашка-наклейка
├── Hero.vue                            # без выделения текста, CtaPanel
├── Interlude.vue                       # перебивка «сборка логотипа»
├── Program.vue                         # карточки-перевёртыши
├── People.vue                          # тёмная секция с лентой (вместо Roles.vue)
├── PhotoSlider.vue                     # слайдер фото (люди, место)
├── History.vue                         # 3 последних + таймлайн в <dialog>
├── Venue.vue                           # + фото
├── Faq.vue                             # анимации
├── Finale.vue                          # CtaPanel + маскоты со следящими глазами
├── Mascot.vue                          # маскот с глазами
└── Footer.vue                          # значки Telegram и ВК
scripts/demo-applications.ts            # демо people вместо roles
```

**Structure Decision**: существующая архитектура лендинга — чистые модули в `lib/site` и
`app/landing`, компоненты разделов в `app/components/landing`, обработчики в `server/`.
Новых слоёв нет.

## Complexity Tracking

| Отступление | Зачем | Почему не проще |
|---|---|---|
| Загрузка фото — обработчик вне `defineAction` | multipart: файл не передать в JSON | Тот же приём, что у ДЗ; право проверяется первой строкой, origin — общей middleware |
| Новая нативная зависимость `sharp` | Проверка, поворот, вырезание EXIF и уменьшение фото | Уменьшение в браузере не проверяет файл и не открывает HEIC; исходники без обработки убивают скорость главной |
