# Контракты: ручки сайта

Все изменяющие — `defineAction` (POST, JSON, ответ `{ ok, message? , ... }`), русские сообщения.

## Организатор (`applications.assign`, если не сказано иначе)

| Ручка | Тело | Ответ |
|---|---|---|
| `GET /api/staff/assessment` | — | сборы: место, время, факультеты, резерв, счётчики ответов, подгруппы; `manage`; для эксперта — только его подгруппы. Право: `applications.review` или `applications.assign` |
| `GET /api/staff/assessment/session/[id]` | — | сбор: списки «Будут / Резерв / Не смогут / Не ответили / Без факультета (вне приглашения)», подгруппы с экспертами и участниками, нераспределённые, `stale` (место изменилось после приглашения) |
| `POST /api/staff/assessment/session` | `{ id?, title, building, room, startsAt, note, faculties[], reserve }` | `{ ok, id }`; второй резервный — отказ |
| `POST /api/staff/assessment/session-delete` | `{ id }` | удаляет сбор, его подгруппы и приглашения; пустые оценки убираются |
| `POST /api/staff/assessment/invite` | `{ sessionId, applicationIds? }` | без списка — все кандидаты факультетов сбора с отправленной анкетой, ещё нигде не приглашённые; со списком — эти (ручное приглашение без факультета). `{ ok, invited, skipped }` |
| `POST /api/staff/assessment/remind` | `{ sessionId }` | напоминание неответившим (не чаще раза в час) `{ ok, reminded }` |
| `POST /api/staff/assessment/notify-change` | `{ sessionId }` | «место или время изменились» — всем, чей день этот сбор, кроме `CANT` |
| `POST /api/staff/assessment/attend` | `{ applicationId, attended }` | отметка «пришёл» |
| `POST /api/staff/assessment/group` | `{ id?, sessionId, title }` | подгруппа |
| `POST /api/staff/assessment/experts`, `member`, `group-delete` | как сейчас | `member` кладёт только в подгруппу своего дня |
| `POST /api/admin/assessment-tasks` | `{ id?, title, order?, active? }` | задания ЦО (право `forms.manage`) |
| `POST /api/admin/assessment-tasks/delete` | `{ id }` | отказ, если есть комментарии |

## Эксперт (эксперт подгруппы; чтение — также `applications.view_all`)

| Ручка | Тело | Ответ |
|---|---|---|
| `GET /api/staff/assessment/[id]` | — | экран подгруппы: кандидаты, оценки, задания, заметки к заданиям и фон по колонкам |
| `GET /api/staff/assessment/notes?groupId=` | — | только заметки (для опроса раз в 2 с) |
| `POST /api/staff/assessment/task-note` | `{ applicationId, taskId, text }` | своя заметка; пустая — удалить |
| `POST /api/staff/assessment/group-note` | `{ groupId, text }` | свой фоновый комментарий |
| `POST /api/staff/reviews/score-comment` | `{ reviewId, criterionId, comment }` | комментарий к своему баллу |

## Кандидат (`requireProfile`)

| Ручка | Тело | Ответ |
|---|---|---|
| `GET /api/cabinet/assessment` | — | `{ title, description, state, invite: null \| { answer, canChange, day: Place, session: Place, reserve: Place \| null } }` — **без подгрупп и оценок** |
| `POST /api/cabinet/assessment/answer` | `{ answer: "GOING" \| "RESERVE" \| "CANT" }` | `{ ok, message }`; поздно — отказ с объяснением |

Удаляются: `POST /api/cabinet/assessment/book`, `/cancel`, `POST /api/staff/assessment/distribute`.

## Уведомления (`notify`, категория SELECTION)

- приглашение: «Центр оценки: {день}, {время} — будете?», ссылка `/cabinet/assessment`,
  ключ `assessment-invite:{inviteId}`;
- напоминание: «Ответьте на приглашение на центр оценки», ключ с датой;
- изменение места: «Центр оценки: изменилось место или время», ключ со снимком.

## Дополнение: очередь резервного дня

`POST /api/cabinet/assessment/answer { answer: "RESERVE" }` сохраняет reserveQueued=true даже без резервного сбора; GET кандидата возвращает этот флаг и day=null до рассылки.

`GET /api/staff/assessment` возвращает reserveQueue (applicationId, name, faculty, queuedAt), FIFO; обычному эксперту — пустой список.

`POST /api/staff/assessment/reserve-invite {}` требует applications.assign и текущий сезон. Выбирает первых ожидающих до capacity существующего будущего резервного сбора, сохраняет исходные приглашения, шлёт срочное уведомление. `{ ok, message }`; журнал assessment.reserve.invite содержит sessionId и числа приглашённых/оставшихся. Нет сбора, мест или очередь пуста — новых назначений нет.
