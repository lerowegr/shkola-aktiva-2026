# Tasks: Вторая итерация доработок лендинга

**Input**: Design documents from `specs/002-landing-refine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui.md, quickstart.md

**Tests**: по просьбе владельца — для чистых модулей `app/landing/mosaic.ts` и
`app/landing/ribbon.ts`. Интерфейс проверяется руками по quickstart.md.

**Organization**: задачи сгруппированы по историям пользователя (US1–US5 из spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: история из spec.md

## Path Conventions

Nuxt-проект в корне репозитория: `app/landing/` (чистые модули и сцены three.js),
`app/components/landing/` (разделы главной), `app/pages/index.vue`, `app/assets/css/main.css`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Вынести пиксельные карты объектов (HEART, STAR, ASTERISK, SMILE, FLAME, BOLT, CURSOR, `crescent()`, тип `PixelMap`) из app/landing/voxel-scene.ts в app/landing/pixel-maps.ts и импортировать их в voxel-scene.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T002 Добавить `lowPowerDevice()` в app/landing/support.ts: `navigator.connection.saveData`, либо (только где есть `deviceMemory`, т.е. Chrome) `deviceMemory <= 2` или `hardwareConcurrency <= 4` — слабое устройство; Safari на iOS всегда отдаёт 2 ядра, поэтому ядрам без памяти не верим

**Checkpoint**: общая основа готова, истории можно делать независимо.

---

## Phase 3: User Story 1 - Перебивка со стикером (Priority: P1) 🎯 MVP

**Goal**: объекты рассыпаются на стеклянные кубики, кубики складываются мозаикой в стикер,
мозаика сменяется чётким логотипом; старт при входе секции, сборка за один экран, обратимо.

**Independent Test**: quickstart, сценарий 1 — на телефоне и компьютере, с «уменьшить
движение» и без WebGL.

### Tests for User Story 1

- [x] T003 [P] [US1] Тесты app/landing/mosaic.test.ts: `mosaicCells` берёт только клетки, центр которых внутри круга радиуса N/2, и отбрасывает клетки с прозрачностью больше половины; цвет клетки — из переданных пикселей (0…1); `object` — ближайший по углу объект; `slot` — клетка карты объекта, кубиков больше клеток — по кругу; `delay` в 0…0.2; `cubeAt(cell, 0)` — в объекте, `cubeAt(cell, 1)` — в клетке мозаики, плоско, цвет клетки; одинаковый прогресс — одинаковый результат (обратимость)

### Implementation for User Story 1

- [x] T004 [US1] Чистый модуль app/landing/mosaic.ts: `mosaicCells(pixels: Uint8ClampedArray, size, objects: { angle, map }[])` → `MosaicCell[]` (поля `col`, `row`, `x`, `y` в −1…1 с y вверх, `color`, `object`, `slot`, `delay` — data-model.md) и `cubeAt(cell, progress, layout)` → положение, поворот, масштаб, доля цвета клетки; фазы R4: 0–0.2 объекты подплывают и рассыпаются, 0.15–0.85 полёт по закрученной траектории со сдвигом `delay`, 0.85–1 мозаика плоская
- [x] T005 [US1] Сцена app/landing/mosaic-scene.ts: `createMosaicScene({ canvas, background, lowPower })` → `{ progress(p), resize(), dispose() }`; снимает цвета с `/brand/logo-sticker.webp` на холсте N×N (40, слабым — 26), один `InstancedMesh` из `RoundedBoxGeometry` со стеклом `MeshPhysicalMaterial` (transmission 1, clearcoat) и `instanceColor`; объекты по кругу ASSEMBLE (направления и цвета как у стикера); радиус мозаики = радиус стикера `min(35vmin, 260px)` в мировых единицах; кадр рисуется только при смене прогресса; плотность пикселей 1 для слабых
- [x] T006 [US1] Убрать режим `assemble` (ASSEMBLE, `renderAssemble`, `ringRadius`, опцию `mode`) из app/landing/voxel-scene.ts — он переезжает в mosaic-scene.ts
- [x] T007 [US1] Переделать app/components/landing/Interlude.vue: секция 150svh с липкой сценой `sticky top-0 h-[100svh]` (без `overflow-hidden` у секции — ломает sticky, `overflow-clip`); ScrollTrigger без `pin`, `start: "top bottom"`, `end: "top top"`, `scrub: 0.5`, прогресс → `scene.progress()`; чёткий стикер проявляется поверх мозаики на 0.85–1 (opacity, scale 0.96→1); сцена создаётся, когда до секции экран (IntersectionObserver `rootMargin: "100% 0px"`)
- [x] T008 [US1] Запасной вариант без WebGL в app/components/landing/Interlude.vue: стикер из 6×6 плиток (кусочки той же картинки через `background-position` в круглой маске), плитки слетаются по той же прокрутке GSAP; «уменьшить движение» — неподвижный стикер с объектами вокруг (как сейчас)
- [x] T009 [US1] Проверить в браузере (компьютер и 375px): движение заметно, как только перебивка показалась снизу; стикер собран через экран; прокрутка назад разбирает без рывков; режимы без WebGL и с «уменьшить движение»

**Checkpoint**: перебивка выглядит как сборка из пикселей и начинается вовремя.

---

## Phase 4: User Story 2 - История таймлайном с линией (Priority: P1)

**Goal**: вертикальный таймлайн: линия посередине, чередование сторон, точки загораются,
6 свежих + раскрытие остальных на месте; на телефоне линия слева.

**Independent Test**: quickstart, сценарий 2 — с 4 и с 30 событиями, компьютер и 375px.

### Implementation for User Story 2

- [x] T010 [US2] Переписать разметку app/components/landing/History.vue: события свежие сверху (`latestEvents(items, items.length)`), видно 6; ≥768 px — линия посередине, год крупно с одной стороны, заголовок, текст и фото с другой, стороны чередуются; <768 px — линия слева, всё справа; одно событие — без линии и кнопки; диалог на весь экран убрать
- [x] T011 [US2] Раскрытие в app/components/landing/History.vue: кнопка «Вся история · ещё N» (`aria-expanded`, `aria-controls`) показывает остальные события ниже тем же видом; в раскрытом виде над списком ряд годов (кнопки, переход `scrollIntoView`, при «уменьшить движение» — без плавности); внизу «Свернуть» — снова 6 и прокрутка к началу раздела
- [x] T012 [US2] Анимация в app/components/landing/History.vue через `motion()`: линия заливается цветом по прокрутке (`scaleY`, `scrub`), точка события загорается, когда событие на 60% высоты экрана (`toggleClass`), карточки выезжают со своей стороны; новые события после раскрытия получают те же триггеры (`ScrollTrigger.refresh`); «уменьшить движение» — линия залита, все точки горят
- [x] T013 [US2] Проверить в браузере: 4 и 30 событий (демо или админка), компьютер и 375px без горизонтальной прокрутки, раскрытие и сворачивание, переход к году

**Checkpoint**: история читается как линия времени.

---

## Phase 5: User Story 3 - Своя прокрутка в стиле бренда (Priority: P2)

**Goal**: на главной системная полоса скрыта, вместо неё маскот на тонкой линии; в
кабинетах — тонкая полоса в цветах бренда.

**Independent Test**: quickstart, сценарий 3 — Safari, Chrome, Firefox; колесо, тачпад,
клавиши, якоря, перетаскивание маскота; телефон.

### Implementation for User Story 3

- [x] T014 [P] [US3] Стили в app/assets/css/main.css: глобально `scrollbar-width: thin; scrollbar-color` ink 30% / прозрачный и `::-webkit-scrollbar` 10 px со скруглённым ползунком ink/25; `html.landing` — `scrollbar-width: none` и `::-webkit-scrollbar { display: none }`
- [x] T015 [US3] Компонент app/components/landing/Scrollbar.vue: `aria-hidden`, фиксированная тонкая линия справа, маскот `blue-a` (компонент `LandingMascot`, зрачки смотрят в сторону прокрутки) едет по прогрессу `scrollY / (scrollHeight − innerHeight)`; виден при прокрутке и наведении, прячется через 1.2 с покоя; страница короче экрана — не показывается; маскота тянут мышью (захват указателя → `window.scrollTo`), клик по линии — переход; `pointer: coarse` — `pointer-events: none`; обновление через `requestAnimationFrame`, слушатели `passive`
- [x] T016 [US3] Подключить в app/pages/index.vue: `useHead({ htmlAttrs: { class: "landing" } })` и `<LandingScrollbar />`
- [x] T017 [US3] Проверить в браузере: на главной нет системной полосы, маскот появляется и прячется, тянется, якоря меню и клавиши работают; в кабинете тонкая полоса; на 375px маскот не мешает касаниям

**Checkpoint**: полоса прокрутки в стиле бренда.

---

## Phase 6: User Story 4 - Ленту людей можно листать самому (Priority: P2)

**Goal**: лента едет сама, перехватывается перетаскиванием, пальцем и колесом, бесконечно,
и снова едет через ~4 с.

**Independent Test**: quickstart, сценарий 4 — компьютер (мышь, тачпад) и телефон.

### Tests for User Story 4

- [x] T018 [P] [US4] Тесты app/landing/ribbon.test.ts: `wrap(offset, period)` всегда в [0, period) и для отрицательных; `isDrag(dx, dy)` — порог 6 px, вертикальный жест не перетаскивание; `decay(velocity, dt)` затухает к нулю; `cruise(idleMs)` — 0 до 4 с без касаний, затем плавно до хода; `copiesNeeded(period, viewport)` — минимум 2 и закрывает экран с запасом

### Implementation for User Story 4

- [x] T019 [US4] Модуль app/landing/ribbon.ts: чистые `wrap`, `isDrag`, `decay`, `cruise`, `copiesNeeded` и `createRibbon({ viewport, track, auto })` → `{ refresh(), dispose() }`: `requestAnimationFrame` двигает `transform` дорожки, перетаскивание указателем с порогом (короткое касание — нажатие, клик после перетаскивания гасится), инерция, горизонтальное колесо/тачпад (`preventDefault` только при `|deltaX| > |deltaY|`), наведение мышью — пауза, фокус на карточке за краем — подвод в кадр; кадр не рисуется, пока лента не видна (IntersectionObserver)
- [x] T020 [US4] Переделать app/components/landing/People.vue на `createRibbon`: CSS-анимацию убрать, число копий — `copiesNeeded` (вторая и следующие — `aria-hidden` и `inert`), `touch-action: pan-y`, курсор `grab`/`grabbing`; «уменьшить движение» — без автохода, листается вручную; меньше пяти людей — прежний ряд с прокруткой
- [x] T021 [P] [US4] В app/components/landing/PhotoSlider.vue при нескольких фото `pointerdown` не всплывает к ленте (`stopPropagation`), свайп листает фото
- [x] T022 [US4] Проверить в браузере: перетаскивание мышью в обе стороны без шва, тачпад по горизонтали, вертикальная прокрутка страницы над лентой, возобновление через ~4 с, свайп по фото, клик по стрелкам фото, Tab по карточкам; 375px

**Checkpoint**: ленту можно листать самому.

---

## Phase 7: User Story 5 - Программа парит заметнее (Priority: P3)

**Goal**: карточки заметнее покачиваются вразнобой и расходятся при прокрутке, не наезжая
на тексты соседей.

**Independent Test**: quickstart, сценарий 5.

### Implementation for User Story 5

- [x] T023 [US5] В app/components/landing/Program.vue: парение амплитудой ~16 px с наклоном до 1° и сдвигом вбок, своя длительность у каждой карточки (5–7.5 с) и фаза; не парит при наведении, фокусе и перевороте; промежутки сетки 20–24 px
- [x] T024 [US5] Расхождение при прокрутке в app/components/landing/Program.vue: обёртка `.drift` между ячейкой (появление) и карточкой; через `gsap.matchMedia` от 768 px — сдвиг по вертикали ±28 px с разной скоростью у ячеек (`scrub`, от входа раздела до выхода), у середины экрана выровнены; на телефоне — без расхождения
- [x] T025 [US5] Проверить в браузере: парение заметно, при прокрутке карточки расходятся и сходятся, перевёрнутая карточка стоит, тексты соседей не перекрываются; 375px

**Checkpoint**: программа живая.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T026 Обновить CLAUDE.md (раздел «Что где лежит» / лендинг): мозаика перебивки в app/landing/mosaic*.ts, лента в app/landing/ribbon.ts, своя полоса прокрутки главной и класс `html.landing`
- [x] T027 `npm run check` зелёный (типы, линт, тесты)
- [x] T028 Пройти quickstart.md целиком: 375px без горизонтальной прокрутки (SC-005), «уменьшить движение», Lighthouse мобильный — первый экран не хуже прежнего (SC-006)
- [x] T029 Пересобрать `npm run build` и перезапустить сервер показа на порту 3100 (туннель Cloudflare), проверить главную по ссылке

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → истории.
- **US1** зависит от T001 (карты объектов) и T002 (слабые устройства).
- **US2, US3, US4, US5** от основы не зависят и друг от друга тоже — можно в любом порядке.
- **Polish** — после всех историй.

### Within Each User Story

- Тесты (T003, T018) пишутся до модулей и сначала падают.
- Чистый модуль → сцена/движок → компонент → проверка в браузере.

### Parallel Opportunities

- T003 и T018 — разные файлы тестов.
- T014 (CSS) и T021 (слайдер) — независимы от остальных задач своих историй.
- Истории US2–US5 трогают разные компоненты — можно вести параллельно.

## Parallel Example: User Story 4

```bash
Task: "Тесты app/landing/ribbon.test.ts"                 # T018
Task: "stopPropagation в app/components/landing/PhotoSlider.vue"  # T021
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1–2 (карты объектов, слабые устройства).
2. US1 — перебивка: главная жалоба владельца.
3. Проверить и показать.

### Incremental Delivery

US1 → US2 (история) → US3 (полоса) → US4 (лента) → US5 (программа); после каждой — проверка
в браузере и `npm run check`.

---

## Phase 9: Convergence

- [x] T030 Привести research.md (R2, R4) и data-model.md к коду перебивки: объекты стартуют в верхней полосе сцены и спускаются к кругу (0–0.4), трескаются 0.1–0.3, кубики летят 0.22–0.85, чёткий стикер проявляется 0.83–0.93, кубики уходят под него 0.93–1; сигнатура `cubeAt(cell, progress, layout, objects)` per plan: R2/R4 (contradicts)
- [x] T031 Вписать в specs/002-landing-refine/contracts/ui.md и research.md R6: ряд годов истории виден всегда, когда событий больше 6, переход к скрытому году сам раскрывает историю per contracts/ui.md (contradicts)
- [x] T032 Исправить числа программы в research.md R9 и contracts/ui.md: расхождение ±16 px (а не ±28, иначе края наезжают на тексты соседей, FR-009), парение 14 px на широком экране и 10 px на телефоне per plan: R9 (contradicts)
- [x] T033 Вписать в contracts/ui.md подсказку над лентой людей «Потяни ленту, чтобы найти своих.» (только для движущейся ленты) per contracts/ui.md (unrequested)
- [x] T034 Отметить в specs/002-landing-refine/quickstart.md попутную правку app/components/landing/Selection.vue: заголовок этапа `text-[clamp(1.75rem,7.5vw,2.25rem)]`, на 375px «Собеседование» больше не обрезается per Constitution V (unrequested)

---

## Phase 10: Итерация 2 по отзыву — «наклейка-монета» и годы истории

**Goal**: вместо «пиксельного круга» — объёмная монета с чётким логотипом, без
закрепления (логотип на экране ~1 экран прокрутки, а не 2,5); годы истории не обрезаются
в Safari. Заменяет реализацию T003–T008 (мозаика снята).

- [x] T035 [US2] Годам истории отступ сверху `pt-[0.15em]` в app/components/landing/History.vue: у Konkovo цифры на 0.15em выше заявленной строки, и Safari срезал их верх, пока год выезжал
- [x] T036 [US1] Тесты app/landing/coin.test.ts: в начале монета у верха секции целиком внутри (`room`), ребром и уменьшена; по пути виден оборот; в конце лежит лицом, в натуральную величину; отскок после приземления; тень и блик; объекты прячутся за монетой, вылетают по очереди, садятся на круг `RING` с наклоном, при уходе расходятся
- [x] T037 [US1] Чистый модуль app/landing/coin.ts: `coinPose(progress, room)`, `shadowAt`, `glareAt`, `objectPose(index, count, angle, tilt, progress, leave)` по фазам research R4
- [x] T038 [US1] Вынести стеклянный объект из пиксельной карты в app/landing/glass-objects.ts и перевести на него app/landing/voxel-scene.ts
- [x] T039 [US1] 3D-сцена app/landing/sticker-scene.ts: монета (лицо — стикер, оборот — «ША 26», ребро), лицо светится само (`emissiveMap`, без тон-маппинга), блик-шейдер, мягкая тень, 6 стеклянных объектов, покачивание пока видно; плотность 1 на слабых
- [x] T040 [US1] Переделать app/components/landing/Interlude.vue: секция 80svh без закрепления, прогресс сборки «top bottom» → «center center» и ухода; WebGL — сцена; без WebGL — та же монета на CSS 3D по тем же функциям (`mix-blend-multiply` у картинок объектов); «уменьшить движение» — последний кадр в долях стикера
- [x] T041 [US1] Удалить мозаику: app/landing/mosaic.ts, mosaic.test.ts, mosaic-scene.ts
- [x] T042 Обновить spec.md (Clarifications, US1, FR-001/FR-002, крайние случаи), plan.md, research.md R1–R5, data-model.md, contracts/ui.md, quickstart.md и CLAUDE.md под монету
- [x] T043 Проверить в Chrome (телефон 390×844 и 1440×900, без WebGL, «уменьшить движение»): движение видно сразу, к середине экрана монета лежит, обратная прокрутка; `npm run check` зелёный

---

## Phase 11: Итерация 3 по отзыву — «стикер-бомбинг»

**Goal**: монета выглядела рвано («5 fps»): кадры шли 60 в секунду, но вращение было
привязано к прокрутке. Вместо неё — коллаж наклеек, ролик по времени при появлении.
Заменяет реализацию T036–T041 (монета снята).

- [x] T044 [US1] Скрипт scripts/make-stickers.ts (sharp): убрать белый фон заливкой от краёв, запечь белую вырезную обводку; результат — public/brand/stickers/*.webp (логотип, «ША 26», 6 стеклянных объектов, 2 маскота)
- [x] T045 [US1] Раскладка app/landing/stickers.ts и тест app/landing/stickers.test.ts: логотип последний и посередине, имена уникальны, наклейки в рамке коллажа на телефоне (квадрат) и широком экране (16:10)
- [x] T046 [US1] Переписать app/components/landing/Interlude.vue: коллаж (место и наклон — внешний слой, анимация — внутренний), ролик GSAP по `onEnter` при «top 70%», сброс по `onLeaveBack`, готовый коллаж при открытии ниже, при «уменьшить движение» и без JS; наведение приподнимает наклейку
- [x] T047 [US1] Удалить монету: app/landing/coin.ts, coin.test.ts, sticker-scene.ts; убрать неиспользуемый `lowPowerDevice` из app/landing/support.ts
- [x] T048 Обновить spec.md (Clarifications, US1, FR-001/FR-002, SC-001, крайние случаи), plan.md, research.md R1–R5, data-model.md, contracts/ui.md, quickstart.md, CLAUDE.md
- [x] T049 Проверить в Chrome кадры ролика (телефон 390×844, 1440×900), «уменьшить движение»; `npm run check` зелёный

---

## Phase 12: Правка по показу — полоса прокрутки на узких экранах

- [x] T050 [US3] app/components/landing/Scrollbar.vue: маскот с линией — только от 1248 px, уже — тонкая полоска 4 px у самого края (не заходит в 16-пиксельное поле: линия и маскот заезжали на кнопки «+» в «Вопросах»); проверено на 390, 1024 и 1440 px
