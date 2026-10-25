# Data Model: Центр оценки — приглашения, подгруппы, комментарии

## AssessmentSession — сбор ЦО (новая)

| Поле | Тип | Правила |
|---|---|---|
| id | cuid | |
| seasonId | → Season | cascade |
| title | String | 1–80 знаков |
| building, room | String? | до 120 |
| startsAt | DateTime | обязательно (МСК при вводе) |
| note | String? | до 500 |
| faculties | String[] | из FACULTIES; у резервного игнорируется |
| reserve | Boolean | не больше одного `true` на сезон |
| invited | Json? | снимок места при последнем приглашении/«сообщить об изменении» |
| invitedAt | DateTime? | |

Связи: `invites`, `groups` (подгруппы).

## AssessmentInvite — приглашение (новая)

| Поле | Тип | Правила |
|---|---|---|
| id | cuid | |
| sessionId | → AssessmentSession | cascade |
| applicationId | → Application, **unique** | одно приглашение на анкету |
| invitedAt | DateTime | |
| answer | AssessmentAnswer? | `GOING` · `RESERVE` · `CANT`; null — не ответил |
| answeredAt | DateTime? | |
| remindedAt | DateTime? | последнее напоминание |
| attended | Boolean | отметка «пришёл» (по «своему дню») |

**«Свой день»**: `answer = RESERVE` → резервный сбор сезона; иначе — `session`.
**Менять ответ** можно, пока не начался «свой день» (и, при переходе, — новый день).

## AssessmentGroup — подгруппа (изменена)

`+ sessionId String?` → AssessmentSession (cascade on delete — удаляются с подгруппами по
подтверждению). `− capacity`, `− faculties`. Поля места (`building/room/startsAt/notified`)
у подгрупп больше не показываются кандидату; остаются для совместимости.

## AssessmentTask — задание ЦО (новая)

| Поле | Тип | Правила |
|---|---|---|
| id, seasonId | | |
| title | String | 1–80 |
| order | Int | |
| active | Boolean | неактивное не показывается на новых экранах; удалить с заметками — нельзя |

Сид досоздаёт четыре по умолчанию: «Представление инициативы», «Креативщики», «Поход на фильм»,
«Рефлексия».

## AssessmentTaskNote — комментарий к заданию (новая)

`taskId × applicationId × authorId` unique, `text` (до 2000), `updatedAt`. Пишет только эксперт
подгруппы кандидата; пустой текст удаляет запись.

## AssessmentGroupNote — фоновый комментарий подгруппы (новая)

`groupId × authorId` unique, `text` (до 4000), `updatedAt`.

## ReviewScore (изменена)

`+ comment String?` — до 1000 знаков; меняет только автор оценки.

## Состояния приглашения

```
(нет) --пригласить--> invited(answer=null)
invited --«Буду»--> GOING
invited --«Резервный день»--> RESERVE   (свой день = резервный сбор)
invited --«Не смогу»--> CANT
GOING/RESERVE/CANT --смена до начала своего дня--> любой другой
```

## Дополнение: очередь резервного дня

`AssessmentInvite.reserveQueued Boolean @default(false)` — ответ RESERVE пока без назначенного дня. `answeredAt` задаёт очерёдность. При выборе другого ответа флаг снимается; повтор RESERVE не меняет дату. Рассылка снимает флаг только в пределах свободных мест резервного сбора. Исходные sessionId/invitedAt сохраняются; существующие назначения остаются reserveQueued=false.
