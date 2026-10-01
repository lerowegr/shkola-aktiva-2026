# Tasks: Доработки лендинга по отзыву

**Input**: Design documents from `specs/001-landing-polish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http.md, quickstart.md

**Tests**: по просьбе владельца — для чистых модулей и серверной логики: схема текстов,
ссылки на фото, уборка, обработка фото, последние события истории, «осталось N дней».
Интерфейс проверяется руками по quickstart.md.

**Organization**: задачи сгруппированы по историям пользователя (US1–US6 из spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: история из spec.md

## Path Conventions

Nuxt-проект в корне репозитория: `lib/` (чистые модули и серверная логика), `server/`
(обработчики), `app/` (страницы и компоненты), `prisma/` (схема).

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Установить `sharp` 0.35 и `simple-icons`, вынести `sharp` во внешние модули Nitro (`nitro.externals`) в nuxt.config.ts
- [x] T002 Добавить модель `SiteImage` (`id` cuid, `seasonId` с каскадом, `storageKey`, `width`, `height`, `bytes`, `createdById?`, `createdAt`; таблица `site_images`) в prisma/schema.prisma и миграцию `npm run db:migrate -- --name site_images`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: фото сайта и новая схема текстов — нужны US2, US4, US5.

- [x] T003 [P] Обработка фото в lib/site/images.ts: `processImage(buffer)` — отказ «Фото больше 15 МБ — уменьшите его или выберите другое.» (>15 МБ), «Фото в формате HEIC — сохраните его как JPEG (на iPhone: Настройки → Камера → Форматы → Наиболее совместимый).», «Это не фото. Подойдут JPEG, PNG или WebP.»; поворот по EXIF, без метаданных, варианты `<key>-480/960/1600.webp` и `<key>-master.webp` (до 2400 px), без растягивания маленьких; `deleteImageFiles(key)`, `imageFile(key, width)`
- [x] T004 [P] Тесты lib/site/images.test.ts: сгенерированный JPEG → 4 файла, ширины не больше исходной, EXIF нет; заголовок HEIC, текстовый файл и файл больше 15 МБ отклоняются с нужным текстом
- [x] T005 Схема в lib/site/content.ts: `PhotoRef = { id: string (cuid), alt: string ≤ 160 }`; раздел `people` вместо `roles` — `title ≤ 80` (по умолчанию «Люди Школы»), `items ≤ 60`: `name 1..60` (обязательно), `role ≤ 60`, `photos: PhotoRef[] ≤ 8`; `venue.photos: PhotoRef[] ≤ 12`; `history.items ≤ 40` с `photo: PhotoRef | null`; `hasContent`: venue виден и при одних фото, people — при людях; подпись раздела «Люди»; `photoIds(content)`
- [x] T006 Тесты схемы в lib/site/content.test.ts: пределы people и фото, `alt ≤ 160`, история до 40, venue только с фото виден, старый `roles` из базы отбрасывается
- [x] T007 В lib/site/store.ts: при сохранении проверить, что все id фото есть у сезона («Фото не найдено — загрузите его заново.»); после сохранения убрать фото сезона без ссылок и старше часа (файлы и записи), вернуть `removedImages`; `imagesMeta(seasonId, ids?)` → `{ id: { width, height } }`
- [x] T008 Тесты хранения в lib/site/content.test.ts: ссылка на несуществующее фото — отказ; фото без ссылок старше часа удаляется вместе с файлами, свежее и используемое остаются
- [x] T009 Загрузка `POST /api/admin/site/images` в server/api/admin/site/images.post.ts: `requirePermission("content.manage")` первой строкой, multipart поле `file`, `processImage`, запись `SiteImage`, журнал `content.image_upload`; подпись в lib/audit-labels.ts
- [x] T010 [P] Раздача в server/routes/media/site/[id]/[file].ts: `<ширина>.webp` для 480/960/1600, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, иначе 404
- [x] T011 Обработчики: server/api/admin/site.get.ts (+ `images` всех фото сезона), server/api/site.get.ts (+ `images` только используемых), server/api/admin/site/save.post.ts (новый отказ, `removedImages` в журнал)
- [x] T012 [P] Компонент app/components/admin/PhotoList.vue: загрузка нескольких фото, превью `/media/site/<id>/480.webp`, порядок (выше/ниже), подпись «Что на фото», удаление, ошибки загрузки текстом сервера, предел числа фото
- [x] T013 [P] Компонент app/components/landing/PhotoSlider.vue: фото по одному, `srcset` 480/960/1600 и `sizes`, пропорции из `images` без прыжков, `loading="lazy"`, свайп, стрелки, точки «N из M», клавиатура; одно фото — без управления
- [x] T014 Демо-тексты в scripts/demo-applications.ts: `people` с пометкой «пример» вместо `roles`, без выдуманных фото

**Checkpoint**: фото загружаются, хранятся, раздаются; схема готова.

---

## Phase 3: User Story 1 - Посетитель сразу видит, как подать заявку (Priority: P1) 🎯 MVP

**Goal**: выразительная плашка заявки сверху и снизу; 3D не выделяет текст.

**Independent Test**: quickstart, сценарии 1–2.

- [x] T015 [P] [US1] `daysLeft(closesAt, now)` по Москве в lib/site/landing.ts: «осталось N дней» (с правильным склонением), «последний день» в день закрытия, null без даты или после закрытия
- [x] T016 [P] [US1] Тесты lib/site/landing.test.ts для `daysLeft` (склонения 1/2/5/11/21, граница полуночи по Москве, прошедшая дата)
- [x] T017 [US1] Плашка-наклейка app/components/landing/CtaPanel.vue: живая точка при открытой анкете, строка состояния, «осталось N дней», кнопка; событие наведения/фокуса кнопки для маскотов
- [x] T018 [US1] app/components/landing/Hero.vue: CtaPanel вместо строки и кнопок; `select-none` и `-webkit-touch-callout: none` на секции, `select-text` у подзаголовка и плашки; без подсветки касания у холста
- [x] T019 [US1] app/components/landing/Finale.vue: CtaPanel вместо заголовка и кнопки

**Checkpoint**: US1 проверяема отдельно.

---

## Phase 4: User Story 2 - Раздел людей Школы с фотографиями (Priority: P1)

**Goal**: тёмное пространство «Люди Школы» с лентой карточек и фото-слайдерами.

**Independent Test**: quickstart, сценарий 3.

- [x] T020 [US2] Админка app/pages/staff/admin/site.vue: раздел «Люди» вместо «Роли» — имя, роль, PhotoList (до 8), порядок людей; проверка схемой с указанием «Люди, пункт N»
- [x] T021 [US2] app/components/landing/People.vue (вместо Roles.vue, удалить его): тёмная секция с фактурой плитки, лента карточек (дубль дорожки для бесшовности) с паузой при наведении, фокусе и касании; карточка — PhotoSlider или маскот без фото, имя, роль; при «уменьшить движение» — ряд с прокруткой
- [x] T022 [US2] app/pages/index.vue: People вместо Roles, ссылка «Люди» в шапке, передача `images`

**Checkpoint**: US1 и US2 работают.

---

## Phase 5: User Story 3 - Программа карточками-перевёртышами (Priority: P2)

**Goal**: парящие карточки, переворот к описанию.

**Independent Test**: quickstart, сценарий 4.

- [x] T023 [US3] app/components/landing/Program.vue: карточка-кнопка с `aria-pressed`, CSS 3D-переворот (лицо — заголовок, оборот — описание), парение со сдвигом фаз, клик/касание/Enter/пробел; без описания — не кнопка; «уменьшить движение» — без парения, мгновенный переворот

---

## Phase 6: User Story 4 - История таймлайном (Priority: P2)

**Goal**: 3 последних события на главной и полный таймлайн по годам.

**Independent Test**: quickstart, сценарий 5.

- [x] T024 [P] [US4] `latestEvents(items, 3)` в lib/site/landing.ts: по числу в начале года, без числа — в конце, исходный порядок при равенстве
- [x] T025 [P] [US4] Тесты `latestEvents` в lib/site/landing.test.ts
- [x] T026 [US4] Админка app/pages/staff/admin/site.vue: у события фото (PhotoList, до 1), до 40 событий
- [x] T027 [US4] app/components/landing/History.vue: 3 последних + «Вся история» (если событий больше 3); `<dialog>` на весь экран, события по годам с фото, липкая лента годов для перехода, Esc и «Закрыть» возвращают на место

---

## Phase 7: User Story 5 - Фотографии места (Priority: P2)

**Goal**: листаемые фото в «Где и когда».

**Independent Test**: quickstart, сценарий 6.

- [x] T028 [US5] Админка app/pages/staff/admin/site.vue: PhotoList места (до 12)
- [x] T029 [US5] app/components/landing/Venue.vue: PhotoSlider вместо плитки, если фото есть; иначе прежний вид

---

## Phase 8: User Story 6 - Зрелищные переходы и живые детали (Priority: P3)

**Goal**: перебивка, анимации вопросов, маскоты в финале, значки в подвале.

**Independent Test**: quickstart, сценарии 7–10.

- [x] T030 [P] [US6] Режим «сборка» в app/landing/voxel-scene.ts: объекты из разлёта по прогрессу 0…1 летят к позициям вокруг центра и тают; без кадров вне видимости
- [x] T031 [US6] app/components/landing/Interlude.vue: закреплённая секция (~150% экрана, scrub), стикер вырастает из 0.6 в 1, сцена создаётся у видимой области; без WebGL и при «уменьшить движение» — неподвижный стикер с картинками объектов; вставить между Selection и Program в app/pages/index.vue
- [x] T032 [P] [US6] Координаты глаз в app/landing/mascot-eyes.ts (green, purple, blue-a, yellow-b) и app/components/landing/Mascot.vue: белые овалы со зрачками, следящими за указателем или последним касанием; без указателя — на кнопку; «уменьшить движение» — зрачки неподвижны
- [x] T033 [US6] app/components/landing/Finale.vue: 4 маскота вокруг стикера, прыжок при наведении/фокусе на кнопку CtaPanel
- [x] T034 [P] [US6] app/components/landing/Faq.vue: высота ответа анимируется при открытии и закрытии (Web Animations API), вопросы появляются по очереди при прокрутке
- [x] T035 [P] [US6] app/components/landing/Footer.vue: значки Telegram и ВК (`siTelegram`, `siVk`) у ссылок

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T036 [P] Документация: CLAUDE.md (фото сайта: `sharp`, `UPLOADS_DIR/site`, `/media/site`), docs/brand.md (глаза маскотов)
- [x] T037 `npm run check` зелёный
- [x] T038 Сценарии quickstart.md в браузере на 375 / 768 / 1280, «уменьшить движение» где возможно; Lighthouse главной — первый экран не медленнее прежнего (SC-005)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → истории.
- **US1** от фото не зависит — можно начинать сразу после Setup.
- **US2, US4, US5** — после Foundational (фото и схема).
- **US3, US6** — после Setup; US6 T033 — после US1 T017 (CtaPanel).
- **Polish** — после всех историй.

### Within Each User Story

- Тесты чистых модулей — вместе с модулем, до компонентов.
- Модуль → обработчик → компонент → страница.

### Parallel Opportunities

- T003/T004 ‖ T010 ‖ T012 ‖ T013 (разные файлы).
- T015/T016 ‖ T024/T025 (одна пара файлов — по очереди внутри, но не мешают другим).
- В US6: T030 ‖ T032 ‖ T034 ‖ T035.

---

## Parallel Example: User Story 6

```text
Task: "Режим «сборка» в app/landing/voxel-scene.ts"
Task: "Координаты глаз в app/landing/mascot-eyes.ts и Mascot.vue"
Task: "Анимации в app/components/landing/Faq.vue"
Task: "Значки в app/components/landing/Footer.vue"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Setup → US1 (плашка заявки, нет выделения текста) → проверка → показать.

### Incremental Delivery

1. Foundational (фото) → US2 (люди) → показать.
2. US3, US4, US5 → показать.
3. US6 (перебивка, вопросы, маскоты, подвал) → показать.
4. Polish: документация, проверка, Lighthouse.

## Phase 10: Convergence

- [x] T039 При «уменьшить движение» зрачки маскотов неподвижны и цикл кадров финала не запускается в app/components/landing/Mascot.vue и app/components/landing/Finale.vue per FR-017 (partial)
- [x] T040 Переход к году в таймлайне мгновенный при «уменьшить движение» в app/components/landing/History.vue per FR-017 (partial)
- [x] T041 Убрать неиспользуемое поле `images` из публичного ответа server/api/site.get.ts (фото на главной в рамках фиксированных пропорций) per plan: GET /api/site (partial)
- [ ] T042 Подтвердить у владельца чёрную главную кнопку по всему лендингу или вернуть синюю вне наклейки заявки в app/assets/css/main.css per FR-002 (unrequested)
- [x] T043 Проверить /staff/admin/site (разделы «Люди», «История», «Место и даты») на 375px и исправить переполнение per Constitution V (partial)
