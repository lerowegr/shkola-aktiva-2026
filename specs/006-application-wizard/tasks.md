# Tasks: Анкета по разделам и форматы ответов

**Input**: specs/006-application-wizard/ (spec.md, plan.md) · **Tests**: чистые правила
`form.ts` и редактор разделов `lib/admin/forms.ts`.

## Phase 1: Foundational

- [x] T001 Схема в prisma/schema.prisma: модель `FormSection` (seasonId, stageKind, order, title, description?, `@@unique([seasonId, stageKind, title])`, таблица `form_sections`), enum `QuestionFormat` (DIGITS, GROUP, PHONE, VK, TELEGRAM), у `FormQuestion` — `format QuestionFormat?`, `minLength Int?`; миграция `npm run db:migrate -- --name form_sections` с переносом существующих разделов из `form_questions.section` (порядок — по первому вопросу)
- [x] T002 prisma/seed.ts: при создании стартовых вопросов — и разделы

## Phase 2: User Story 2 — форматы ответов (P1)

- [x] T003 [P] [US2] Тесты lib/applications/form.test.ts: formatValue для пяти форматов (верные, «грязные», неверные — сценарии US2), minLength, студенческий только цифры и обязательный, stepProblems по полям раздела
- [x] T004 [US2] lib/applications/form.ts: `formatValue`, `QuestionShape.format/minLength`, normalizeAnswer хранит приведённое при верном вводе, submitProblems — минимум, формат, студенческий; `stepProblems(questions, answers, profile, fields)`
- [x] T005 [US2] server/api/cabinet/application/{profile,submit}.post.ts и lib/applications/candidate.ts: студенческий до 20 цифр; отправка пишет приведённые значения; кабинет отдаёт format/minLength и разделы

## Phase 3: User Story 1 — анкета по шагам (P1)

- [x] T006 [US1] app/components/form/Question.vue: поле под формат (inputmode, подсказка-пример), приведение при уходе с поля, счётчик «N из min»
- [x] T007 [US1] app/components/form/Wizard.vue: шаги по разделам (ФИО и студенческий — в первом), «Шаг k из N», «Назад»/«Далее» с проверкой раздела и прокруткой к ошибке, страница проверки с «Изменить», отправка; `?step=`; без шага — первый незаполненный раздел
- [x] T008 [US1] app/pages/cabinet/application.vue на Wizard; после отправки и закрытия — все ответы по разделам только для чтения
- [x] T009 [US1] Проверить в браузере 375px и компьютер: вперёд/назад, ошибки, обновление страницы на шаге, проверка, отправка

## Phase 4: User Story 3 — редактор (P1)

- [x] T010 [P] [US3] Тесты lib/admin/forms.test.ts: раздел создать/переименовать (вопросы переезжают)/переставить (порядок вопросов пересчитан)/удалить (с вопросами — отказ); вопрос с ответами — формат не меняется
- [x] T011 [US3] lib/admin/forms.ts: saveSection, deleteSection, move «section», пересчёт порядка вопросов; saveQuestion — format/minLength, раздел только из существующих, развёрнутым минимум 200 по умолчанию; loadEditor — разделы
- [x] T012 [US3] Ручки: server/api/admin/forms/section.post.ts (новая), question/delete/move — разделы, формат, минимум; аудит
- [x] T013 [US3] app/pages/staff/admin/forms.vue: вопросы сгруппированы по разделам, у раздела — описание, «Изменить», вверх/вниз, удалить; app/components/admin/SectionForm.vue; QuestionForm — раздел выбором, формат, минимум
- [x] T014 [US3] app/pages/staff/admin/forms-preview.vue — Wizard без сохранения; ссылка «Посмотреть как кандидат»
- [x] T015 [US3] Проверить в браузере: собрать раздел «Контактная информация» по листу таблицы, предпросмотр, 375px

## Phase 5: Polish

- [x] T016 CLAUDE.md: разделы анкеты и форматы ответов
- [x] T017 `npm run check`, сценарии spec вручную, коммит по просьбе владельца
