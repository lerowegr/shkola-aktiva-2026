# Implementation Plan: Центр оценки (ЦО)

**Spec**: [spec.md](spec.md) · **Date**: 2026-10-08

## Summary

Новый этап `ASSESSMENT` между ДЗ и собеседованием. Группы ЦО с местом и временем, экспертами и
кандидатами; рассылка места через `notify()`; оценка — существующей системой `Review`
(одна запись на кандидата × эксперта × этап), панель баллов `StaffReviewPanel` переиспользуется
на экране группы. Кандидат видит описание этапа и снимок места из последней рассылки.

## Technical Context

Nuxt 4 / Vue 3.5 / Prisma 7 / PostgreSQL 16 / zod 4 / Tailwind 4 / Vitest — без новых
зависимостей.

## Constitution Check

- I. Права на сервере: все изменения — `defineAction` + `requirePermission`
  (`applications.assign` — группы, рассылка; `applications.review` — оценка через
  существующие `/api/staff/reviews/*`, своя оценка — `review-store`). ✅
- II. Журнал: `assessment.group.save|delete`, `assessment.experts`, `assessment.member`,
  `assessment.distribute`, `assessment.notify`; баллы — уже пишутся. ✅
- III. Единый поток, состояние этапа — `stageState()`; статус оценки — `reviewSummary()`;
  кандидат не видит баллы — `lib/assessment/candidate.ts` отдаёт только место. ✅
- V. Русский, время по Москве (`mskFormat`, `mskInputValue`/`mskFromInput`), 375px,
  `notify()`. ✅
- VI. Тесты на распределение и правила групп (`lib/assessment/groups.test.ts`). ✅

## Design

### Данные (`prisma/schema.prisma`)

- `StageKind` + `ASSESSMENT` (отдельная миграция — новое значение enum нельзя использовать в той
  же транзакции); вторая миграция добавляет этап «Центр оценки» существующим сезонам и сдвигает
  порядок собеседования и итогов.
- `Criterion.description String?` — описание характеристики (лист «цо», колонка «Описание»).
- `AssessmentGroup` { seasonId, title, building?, room?, startsAt?, note?, notified Json?,
  notifiedAt? } — `notified` — снимок места из последней рассылки: его и видит кандидат.
- `AssessmentMember` { groupId, applicationId @unique } — одна группа на кандидата.
- `AssessmentExpert` { groupId, userId } @@id.

### Логика (`lib/assessment/`)

- `groups.ts` — `balance(groups, candidates)` (чистая: поровну, к меньшим), `placeChanged`
  (снимок vs текущее), загрузка списка для организатора, сохранение группы/экспертов/кандидатов
  с созданием `Review(app, ASSESSMENT, expert)` для пар «эксперт группы × кандидат группы»;
  снятие эксперта с поставленными баллами — отказ; перенос кандидата — старые оценки остаются.
- `candidate.ts` — что видит кандидат: этап (название, описание, состояние, даты) и снимок места.

### Интерфейс

- `/staff/assessment` — группы: создание/правка (корпус, аудитория, время МСК, заметка),
  эксперты, кандидаты (добавить, перенести, убрать), «Разложить поровну», «Сообщить группе»,
  пометка «место изменилось — сообщите снова». Для эксперта без права распределения — только
  «Мои группы».
- `/staff/assessment/[id]` — экран группы: кандидаты списком-переключателем, у выбранного —
  своя оценка (`StaffReviewPanel`) и чужие только чтение; прогресс «оценено k из n».
- Вкладка «Центр оценки» → `/staff/assessment`; вкладка проверки ДЗ → «Оценка ДЗ».
- Кабинет: `AppAssessmentCard` на главной кабинета.
- Админка «Анкета и оценка» — вкладка «Оценка ЦО»; в форме критерия — описание.
- «Этапы» — пояснение ЦО для кандидатов; лендинг — шаг ЦО в «Отборе».

### Стартовые критерии

`DEFAULT_ASSESSMENT_CRITERIA` / `DEFAULT_ASSESSMENT_MARKERS` в `lib/applications/defaults.ts`
из листа «цо»: 8 характеристик, шкала 0–6, расшифровки на тех баллах, где они в таблице;
маркеры: Завозность, Публичные выступления, Девиантность.

## Out of scope

Сводка по всем этапам и итоговые решения — следующая фича. Допуск к собеседованию не меняется.
