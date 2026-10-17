# Данные

Схема не меняется. Stage.closesAt определяет дедлайн APPLICATION текущего Season.
User: ACTIVE, без ролей, не владелец; Application со статусом SUBMITTED исключает
напоминание об анкете. AssessmentGroup.notified и notifiedAt определяют опубликованное
назначение; members связывают кандидатов с группой. Notification.key хранит событие,
NotificationDelivery сохраняет существующее расписание внешних доставок.
