/**
 * Подписи действий журнала. Ключ — то, что пишет код (`review.score`),
 * подпись — то, что читает человек в админке. Неизвестный ключ
 * показывается как есть: лучше странная строка, чем пустое место.
 */
export const AUDIT_LABELS: Record<string, string> = {
  "auth.email_login": "Вход по коду на почту (прежний способ)",
  "auth.password_login": "Вход по паролю",
  "auth.telegram_login": "Вход через Telegram",
  "auth.telegram_miniapp": "Вход из Mini App",
  "invite.create": "Приглашение организатора",
  "invite.accept": "Пароль по приглашению",
  "application.submit": "Отправка анкеты",
  "application.assign_all": "Распределение анкет",
  "application.reassign": "Передача анкеты другому мастеру",
  "review.score": "Балл по критерию",
  "review.text": "Маркер или комментарий",
  "decision.set": "Решение по кандидату",
  "decision.bulk": "Решения по порогу",
  "decision.publish": "Публикация результатов",
  "stage.update": "Даты и режим этапа",
  "interview.slots_create": "Нарезка слотов",
  "interview.slot_delete": "Удаление слота",
  "role.save": "Изменение роли",
  "role.delete": "Удаление роли",
  "role.grant": "Выдача роли",
  "role.revoke": "Снятие роли",
  "user.block": "Блокировка",
  "quiz.export": "Выгрузка результатов теста про ША",
  "user.password_reset": "Новый пароль из консоли сервера",
  "assessment.group.create": "ЦО: группа создана",
  "assessment.group.update": "ЦО: группа изменена",
  "assessment.group.delete": "ЦО: группа удалена",
  "assessment.experts": "ЦО: эксперты группы",
  "assessment.member": "ЦО: кандидат в группу",
  "assessment.distribute": "ЦО: раскладка по группам",
  "assessment.notify": "ЦО: место сообщено группе",
  "user.unblock": "Разблокировка",
  "form.question": "Вопрос анкеты",
  "form.question_delete": "Удаление вопроса",
  "form.criterion": "Критерий оценки",
  "form.criterion_delete": "Удаление критерия",
  "form.marker": "Маркер",
  "form.marker_delete": "Удаление маркера",
  "form.move": "Порядок в анкете",
  "broadcast.send": "Рассылка",
  "content.update": "Тексты сайта",
  "content.image_upload": "Фото для сайта",
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
