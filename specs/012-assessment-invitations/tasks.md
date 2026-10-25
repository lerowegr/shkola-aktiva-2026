# Tasks: Центр оценки — приглашения на сборы, подгруппы, комментарии

## Phase 12: Очередь резервного дня

- [x] T045 Уточнить RQ-001–RQ-006 в spec.md и plan.md; сверить конституцию.
- [x] T046 Добавить reserveQueued в prisma/schema.prisma, применить миграцию и синхронизировать sha_test.
- [x] T047 Покрыть очередь, отмену, FIFO, создание без рассылки и гонки тестами в lib/assessment/*.test.ts.
- [x] T048 Реализовать очередь в lib/assessment/candidate.ts, rules.ts, capacity.ts, sessions.ts, groups.ts; API reserve-invite с правами и аудитом.
- [x] T049 Обновить app/components/app/AssessmentCard.vue, app/pages/cabinet/index.vue и app/pages/staff/assessment/index.vue: кнопка, статус, список, рассылка.
- [x] T050 Выполнить npm run check и проверку браузером на 375px, сверить RQ-001–RQ-006, обновить CLAUDE.md.

Проверка очереди: финальный `npm run check` — типы, линтер без замечаний, 457 тестов в 72 файлах.
В браузере на sha_test: выбор без резервного дня, сохранение после перезагрузки, отдельный список организатора, создание сбора без автоматической рассылки, ручная рассылка одному кандидату. На 375px ширина документа 375px и у кандидата, и у организатора. Временные аккаунты/сборы удалены, сервер остановлен. RQ-001–RQ-006 и конституция I–VI сверены с итоговым кодом: недоработок не выявлено. Живым кандидатам тестовые уведомления не отправлялись.

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)

## Phase 1: Setup

- [X] T001 Модель данных в prisma/schema.prisma: `AssessmentSession` (title 1–80, building/room до 120, startsAt обязательно, note до 500, faculties String[], reserve Boolean, invited Json?, invitedAt?), enum `AssessmentAnswer { GOING RESERVE CANT }`, `AssessmentInvite` (applicationId **unique**, answer?, answeredAt?, remindedAt?, attended Boolean), `AssessmentTask` (title 1–80, order, active), `AssessmentTaskNote` (taskId×applicationId×authorId unique, text до 2000), `AssessmentGroupNote` (groupId×authorId unique, text до 4000); `AssessmentGroup.sessionId String?` (cascade), удалить `capacity`/`faculties`; `ReviewScore.comment String?` (до 1000)
- [X] T002 Миграция prisma/migrations/*_assessment_sessions/migration.sql и `npm run db:migrate`
- [X] T003 Сид четырёх заданий ЦО по умолчанию в prisma/seed.ts («Представление инициативы», «Креативщики», «Поход на фильм», «Рефлексия»), только если заданий сезона нет

## Phase 2: Foundational

- [X] T004 Чистые правила сборов в lib/assessment/rules.ts: кому приглашение (факультет ∈ faculties сбора, резервный — всем), «свой день» (RESERVE → резервный сбор), можно ли менять ответ (свой день ещё не начался), снимок места сбора; убрать правила самозаписи (`offeredTo`, `hasRoom`, `canChangeBooking`, константы)
- [X] T005 [P] Тесты правил в lib/assessment/rules.test.ts (заменить тесты самозаписи)
- [X] T006 Удалить самозапись: lib/assessment/candidate.ts (book/cancel), server/api/cabinet/assessment/book.post.ts, cancel.post.ts, lib/assessment/booking.test.ts, поля capacity/faculties в lib/assessment/groups.ts, server/api/staff/assessment/group.post.ts, app/components/staff/AssessmentGroupForm.vue, приглашение выбрать дату в lib/applications/notifications.ts; убрать `distribute` (lib/assessment/groups.ts, server/api/staff/assessment/distribute.post.ts, тесты)

## Phase 3: US1 — сбор и приглашение (P1)

- [X] T007 [US1] lib/assessment/sessions.ts: `saveSession` (валидация, один резервный на сезон), `deleteSession` (подгруппы и приглашения каскадом, пустые оценки убрать), `inviteSession(sessionId, applicationIds?)` — кандидаты факультетов с SUBMITTED, ещё нигде не приглашённые; `notify` с ключом `assessment-invite:{inviteId}`; снимок `invited`
- [X] T008 [P] [US1] Тесты lib/assessment/sessions.test.ts: приглашаются только свои факультеты и отправившие; повтор — 0; уже приглашённый на другой сбор — пропуск; резервный — один
- [X] T009 [US1] Ручки server/api/staff/assessment/session.post.ts, session-delete.post.ts, invite.post.ts (`applications.assign`, аудит `assessment.session.save|delete|invite`)
- [X] T010 [US1] Обзор для организатора: `loadOverview` в lib/assessment/sessions.ts + server/api/staff/assessment/index.get.ts — сборы со счётчиками и подгруппами; эксперт без права распределять — только свои подгруппы
- [X] T011 [US1] Страница сборов app/pages/staff/assessment/index.vue + форма app/components/staff/AssessmentSessionForm.vue (дата/время МСК, корпус, аудитория, заметка, факультеты, «резервный день»), кнопка «Пригласить на центр оценки» с итогом

## Phase 4: US2 — ответ кандидата (P1)

- [X] T012 [US2] Переписать lib/assessment/candidate.ts: `loadCandidateAssessment` — этап, приглашение (answer, canChange, место своего дня, сбора и резервного) **без подгрупп**; `answerInvite(userId, answer)`
- [X] T013 [P] [US2] Тесты lib/assessment/candidate.test.ts: ответы и смена, резервный день → место резервного, поздно — отказ, в ответе кабинета нет полей подгрупп
- [X] T014 [US2] Ручка server/api/cabinet/assessment/answer.post.ts (`requireProfile`)
- [X] T015 [US2] Кабинет: app/components/app/AssessmentCard.vue (приглашение с тремя кнопками / «Вы придёте …» / «Организаторы свяжутся»), app/pages/cabinet/assessment.vue, статусы ленты в app/pages/cabinet/index.vue

## Phase 5: US4 — подгруппы и отбивка (P1)

- [X] T016 [US4] lib/assessment/groups.ts: подгруппа с `sessionId`; `placeMember` — только в подгруппу своего дня кандидата; `setAttended`; загрузка страницы сбора `loadSessionPage` в lib/assessment/sessions.ts (списки ответов, подгруппы с участниками и экспертами, нераспределённые пришедшие/ответившие «буду», `stale`)
- [X] T017 [P] [US4] Тесты в lib/assessment/groups.test.ts: подгруппа в сборе, распределение только в свой день, перенос сохраняет начатые оценки
- [X] T018 [US4] Ручки server/api/staff/assessment/session/[id].get.ts, attend.post.ts; group.post.ts принимает `sessionId`
- [X] T019 [US4] Страница сбора app/pages/staff/assessment/session/[id].vue: ответы, подгруппы блоками с заголовками (отбивка), нераспределённые сверху с выбором подгруппы и «пришёл», создание подгрупп

## Phase 6: US5 — оценка с комментариями (P1)

- [X] T020 [US5] Комментарий к баллу: `saveScoreComment` в lib/applications/review-store.ts, ручка server/api/staff/reviews/score-comment.post.ts, поле в app/components/staff/ReviewPanel.vue (для этапа ЦО); `comment` в данных оценки lib/applications/staff.ts
- [X] T021 [US5] lib/assessment/notes.ts: задания сезона, заметки к заданиям (load/save, права: эксперт подгруппы пишет своё, читают эксперты подгруппы и `applications.view_all`), аудит не чаще раза в 5 минут
- [X] T022 [P] [US5] Тесты lib/assessment/notes.test.ts и комментарий к баллу в lib/applications/review-store.test.ts (только свой)
- [X] T023 [US5] Ручки server/api/staff/assessment/task-note.post.ts, notes.get.ts; задания в данных экрана lib/assessment/sheet.ts
- [X] T024 [US5] Экран подгруппы app/pages/staff/assessment/[id].vue + app/components/staff/AssessmentTaskNotes.vue: под каждым заданием колонки экспертов, своя — с автосохранением, опрос раз в 2 с
- [X] T025 [US5] Админка заданий: app/pages/staff/admin/assessment-tasks.vue, server/api/admin/assessment-tasks*.ts (`forms.manage`, удаление с комментариями — отказ), пункт в app/composables/useAdminSections.ts

## Phase 7: US3 — ответы и напоминание (P2)

- [X] T026 [US3] `remindSession` (неответившим, не чаще раза в час) и `notifyChange` (изменение места — всем своего дня кроме CANT) в lib/assessment/sessions.ts + ручки remind.post.ts, notify-change.post.ts; кнопки и счётчики на страницах сборов
- [X] T027 [P] [US3] Тесты напоминания и уведомления об изменении в lib/assessment/sessions.test.ts

## Phase 8: US6 — фон подгруппы (P2)

- [X] T028 [US6] Фоновый комментарий: save/load в lib/assessment/notes.ts, ручка group-note.post.ts, колонки на экране подгруппы (app/components/staff/AssessmentGroupNotes.vue), опрос вместе с заданиями

## Phase 9: US7 и полировка

- [X] T029 [US7] Демо-сценарий lib/demo/scenario.ts: сбор понедельника (СНиМК+МЭО), сбор другой даты, резервная суббота, ответы всех видов, две подгруппы с экспертами, комментарии
- [X] T030 Документация: CLAUDE.md (раздел ЦО), docs при необходимости
- [X] T031 `npm run check`, ручная проверка по quickstart.md в браузере (включая 375px), выкат, сброс демо на сервере

## Dependencies

Phase 1 → 2 → US1 → US2 → US4 → US5 → US3/US6 (параллельно) → полировка.
US2 зависит от US1 (приглашение), US4 — от US1/US2 (кого распределять), US5 — от US4 (экран подгруппы).

## Implementation Strategy

MVP — US1+US2 (сбор, приглашение, ответ). Затем подгруппы (US4) и комментарии (US5) — к дню ЦО.

## Phase 10: Поздние анкеты и срочная доставка

- [x] T032 Дополнить `spec.md` и `plan.md` правилами AI-001–AI-005, сверить с конституцией.
- [x] T033 В `lib/assessment/sessions.ts` объединить уведомление ручного и автоматического приглашения, сделать его и `notifyChange` срочными, сохранить несрочность напоминания.
- [x] T034 Реализовать `autoInvite` в `lib/assessment/sessions.ts`: опубликованный снимок, ближайший обычный будущий сбор, уникальность, перехват ошибок.
- [x] T035 Подключить после `notifySubmitted` в `server/api/cabinet/application/submit.post.ts`, актуализировать `lib/applications/notifications.ts` и `CLAUDE.md`.
- [x] T036 Защитить повторный `inviteSession` от перезаписи несообщённой правки снимка в `lib/assessment/sessions.ts`.
- [x] T037 Проверить сценарии и ночную доставку в `lib/assessment/sessions.test.ts`, выполнить `npm run check`, сверить AI-001–AI-005 с итоговым кодом.
- [x] T038 После зелёного check создать русский коммит и отправить в main.

Проверка дополнения: `lib/assessment/sessions.test.ts` — 22 теста; полный `npm run check` —
типы и линтер без ошибок, 439 тестов в 70 файлах. Сверка AI-001–AI-005 с реализацией
не выявила недоработок; схема, подгруппы, оценки и страницы кандидата не менялись.
Доставка проверена по очереди тестовой базы, живые Telegram-сообщения не отправлялись.

## Phase 11: Вместимость слотов

- [x] T039 Уточнить CAP-001–CAP-007 в `spec.md`, дополнить `plan.md`.
- [x] T040 Добавить `AssessmentSession.capacity` и миграцию в `prisma/`, применить локально и синхронизировать `sha_test`.
- [x] T041 Добавить общий замок сезона и подсчёт мест в `lib/assessment/capacity.ts`, применить в `sessions.ts` и `candidate.ts`.
- [x] T042 Добавить лимит, занятость, валидацию и сообщения в `app/components/staff/AssessmentSessionForm.vue`, страницах `app/pages/staff/assessment/` и `server/api/staff/assessment/`.
- [x] T043 Проверить 50+16, сохранение первых 50, нехватку слотов, отказы, гонки и резерв в `lib/assessment/capacity.test.ts`, выполнить `npm run check`.
- [x] T044 Сверить CAP-001–CAP-007 с итоговым кодом и проверками, актуализировать `CLAUDE.md`.

Проверено: `npm run check` — типы, линтер, 449 тестов в 71 файле; 10 тестов лимитов,
включая пересоздание резервного сбора с прежними ответами. Сверка CAP-001–CAP-007:
недоработок реализации не найдено. Миграция применена к локальным sha_dev и sha_test.
В локальной демо-копии через браузер проверены заполненный слот 50/50, отказ лимиту 49,
сохранение 50; при ширине 375px ширина документа 375px, горизонтальной прокрутки нет.
Временный сервер остановлен, вымышленные пользователи и проверочный сбор удалены.
