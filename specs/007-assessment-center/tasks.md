# Tasks: Центр оценки (ЦО)

## Phase 1: Основа

- [x] T001 Миграции: `ASSESSMENT` в `StageKind`; `Criterion.description`; модели `AssessmentGroup`, `AssessmentMember`, `AssessmentExpert`; этап «Центр оценки» в существующих сезонах со сдвигом порядка — `prisma/schema.prisma`, `prisma/migrations/*`
- [x] T002 Сид: этап ЦО (порядок 3), критерии и маркеры ЦО из листа «цо» — `prisma/seed.ts`, `lib/applications/defaults.ts`
- [x] T003 Типы этапов: заголовки уведомлений, тексты лендинга и админки «Сайт», `cta.ts`, `Selection.vue`, «Этапы» — `lib/applications/notifications.ts`, `lib/site/content.ts`, `app/landing/cta.ts`, `app/components/landing/Selection.vue`, `app/pages/staff/admin/site.vue`

## Phase 2: US1 — группы и рассылка (P1)

- [x] T004 [US1] Чистые правила `balance`, `placeChanged` + тесты — `lib/assessment/rules.ts`, `lib/assessment/rules.test.ts`
- [x] T005 [US1] Хранение групп, экспертов, кандидатов, оценок-заготовок; тесты на базе — `lib/assessment/groups.ts`, `lib/assessment/groups.test.ts`
- [x] T006 [US1] Обработчики `server/api/staff/assessment/*` (defineAction, `applications.assign`, аудит)
- [x] T007 [US1] Рассылка места через `notify()` со снимком — `lib/assessment/groups.ts`
- [x] T008 [US1] Страница `/staff/assessment` — `app/pages/staff/assessment/index.vue`, `app/components/staff/AssessmentGroupForm.vue`
- [x] T009 [US1] Вкладки: «Центр оценки» → ЦО, «Оценка ДЗ» — `app/layouts/staff.vue`, `server/api/staff/nav.get.ts`, `app/pages/staff/applications/[id].vue`

## Phase 3: US2 — оценка группы (P1)

- [x] T010 [US2] Экран группы с панелями оценки — `server/api/staff/assessment/[id].get.ts`, `app/pages/staff/assessment/[id].vue`, `app/components/staff/ReviewPanel.vue`

## Phase 4: US3 — кандидат (P1)

- [x] T011 [US3] Что видит кандидат — `lib/assessment/candidate.ts`, `server/api/cabinet/assessment.get.ts`, `app/components/app/AssessmentCard.vue`, `app/pages/cabinet/index.vue`

## Phase 5: US4 — критерии ЦО (P2)

- [x] T012 [US4] Вкладка «Оценка ЦО» и описание критерия — `lib/admin/forms.ts`, `server/api/admin/forms/{criterion,marker}.post.ts`, `app/pages/staff/admin/forms.vue`, `app/components/admin/CriterionForm.vue`

## Phase 6: Проверка

- [x] T013 `npm run check`, сценарии в браузере на localhost (организатор, эксперт, кандидат), 375px; CLAUDE.md — раздел про ЦО
