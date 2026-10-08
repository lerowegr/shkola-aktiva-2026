# Implementation Plan: Анкета по разделам и форматы ответов

**Branch**: `006-application-wizard` (без отдельной ветки) | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

## Summary

Анкета кандидата становится пошаговой: раздел за шаг с описанием, «Назад»/«Далее», проверка
раздела теми же правилами, что и отправка, итоговый шаг «проверить и отправить», шаг в адресе.
У вопросов «строка» появляется формат (цифры, группа, телефон, ВК, Telegram) с приведением к
единому виду, у текстовых — минимум знаков (развёрнутые — 200 по умолчанию); студенческий —
обязательный, только цифры. В админке — разделы с описанием и порядком, формат и минимум у
вопроса, предпросмотр анкеты глазами кандидата.

## Technical Context

**Language/Version**: TypeScript 5 strict, Node 24, Vue 3.5 SFC · **Primary Dependencies**:
Nuxt 4, Prisma 7, zod 4, Tailwind 4 — новых нет · **Storage**: PostgreSQL — новая таблица
`form_sections`, у `form_questions` поля `format`, `minLength` · **Testing**: Vitest — чистые
правила форматов и проверки раздела (`lib/applications/form.ts`), редактор разделов
(`lib/admin/forms.ts`, база `sha_test`); руками — quickstart · **Target**: телефоны (375px) и
компьютеры · **Constraints**: старые ответы и уже отправленные анкеты не меняются; сводки и
карточки мастера, которые сортируют по `FormQuestion.order`, продолжают работать.

## Constitution Check

| Принцип | Проверка | Итог |
|---|---|---|
| I. Права на сервере | Новые ручки разделов — `defineAction` + `requirePermission("forms.manage")`; кандидатские — `requireSignedIn` + `editableDraft` | ✅ |
| II. Журнал | `form.section`, `form.question` (+ формат), удаление и перестановка — в аудит | ✅ |
| III. Честный отбор | Отбор не меняется: те же вопросы и оценка, только подача | ✅ |
| IV. Данные | Новых персональных данных нет; приведение ВК/телефона — без внешних запросов | ✅ |
| V. Русский, 375px | Ошибки форматов по-русски с примером; шаги проверяются на 375px | ✅ |
| VI. Проверка | Правила — в чистом `form.ts` с тестами; `npm run check`; браузер | ✅ |

## Design decisions (research)

- **R1. Разделы — таблица `FormSection` (сезон, этап, название, описание, порядок), вопросы
  ссылаются по названию (`FormQuestion.section`, как сейчас).** Переименование раздела меняет
  название у его вопросов в одной транзакции. Отвергли внешний ключ: пришлось бы переделать
  все места, где показывается `question.section` (карточка мастера, списки, кабинет), ради
  того же результата.
- **R2. Порядок вопросов пересчитывается по разделам.** После перестановки раздела или переноса
  вопроса в другой раздел `order` всех вопросов этапа переписывается: сначала порядок раздела,
  внутри — порядок вопроса. Всё, что сортирует по `order`, сразу показывает по разделам.
- **R3. Формат — enum `QuestionFormat` (DIGITS, GROUP, PHONE, VK, TELEGRAM), только у строки.**
  Правило — чистая функция `formatValue(format, raw)` → приведённое значение или сообщение.
  Автосохранение хранит приведённое, если ввод уже верный, иначе как есть (человек печатает);
  отправка требует верного и пишет приведённое.
  - DIGITS: убрать пробелы, только цифры.
  - GROUP: ВЕРХНИЙ РЕГИСТР без пробелов, `^[А-ЯЁA-Z]{2,8}\d{2}-\d{1,2}$`.
  - PHONE: 11 цифр с 7/8 или 10 цифр → `+7 (XXX) XXX-XX-XX`.
  - VK: vk.com / vk.ru / m.vk.com / @ник / ник → `https://vk.ru/<ник>`; другой сайт — ошибка.
  - TELEGRAM: t.me/ник, @ник, ник → `@ник`; 5–32 знака, латиница, цифры, «_».
- **R4. Минимум знаков — `minLength` у текстовых вопросов**, новым развёрнутым — 200.
  Проверяется при «Далее» и отправке, у кандидата — счётчик.
- **R5. Шаги — на странице анкеты, шаг в `?step=`**; без шага — первый раздел с незаполненным,
  всё заполнено — проверка. «Далее» сначала дожидается автосохранения, потом проверяет раздел
  чистой `stepProblems` (та же логика, что `submitProblems`, по полям раздела).
- **R6. Предпросмотр — тот же компонент шагов с ответами в памяти** (`FormWizard`), страница
  `/staff/admin/forms-preview`; ничего не сохраняет.

## Project Structure

```text
prisma/schema.prisma                         # FormSection, QuestionFormat, FormQuestion.format/minLength
lib/applications/form.ts (+ test)            # formatValue, minLength, stepProblems, studentId
lib/applications/candidate.ts                # + sections в ответе кабинета
lib/admin/forms.ts (+ test)                  # разделы: сохранить, удалить, переставить, пересчёт порядка
server/api/admin/forms/section.post.ts       # новый
server/api/admin/forms/{question,delete,move}.post.ts, forms.get.ts
server/api/cabinet/application/{answer,profile,submit}.post.ts
app/components/form/Wizard.vue               # шаги, проверка раздела, страница проверки
app/components/form/Question.vue             # формат, счётчик, приведение при уходе с поля
app/pages/cabinet/application.vue            # на Wizard
app/pages/staff/admin/forms.vue, forms-preview.vue
app/components/admin/{QuestionForm,SectionForm}.vue
prisma/seed.ts                               # разделы для стартового набора
```

## Complexity Tracking

Отступлений нет.
