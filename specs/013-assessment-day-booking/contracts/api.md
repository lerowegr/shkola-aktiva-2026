# Контракты

GET cabinet/assessment: invite.invitedDay, faculty, slots и reserveSlots; у слота current/full/closed. day только для подтверждённой записи, changeClosesAt для неё. Кандидат не получает оценки/подгруппы/чужие данные.

POST cabinet/assessment/answer: GOING с sessionId выбирает время; без sessionId допустим единственный доступный слот/повтор уже выбранного. RESERVE/CANT освобождают запись только до двухчасовой границы, выход из подгруппы атомарно.

POST staff/assessment/invite: sessionId опорного слота и optional faculty для приглашения факультета в этот день, не на конкретное время. Повтор idempotent по applicationId. POST reserve-invite предлагает резервные времена ожидающим, не бронирует их.

POST group: faculty для новой подгруппы; POST member проверяет время/факультет. Административные API по-прежнему applications.assign + аудит.
