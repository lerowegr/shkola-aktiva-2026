/**
 * Сегменты рассылок — отдельным файлом без обращений к базе: список нужен и
 * странице в браузере, и серверу.
 */
export const SEGMENTS = {
  candidates: "Все кандидаты",
  drafts: "Начали анкету, но не отправили",
  submitted: "Отправили анкету",
  passed_application: "Прошли анкету",
  rejected_application: "Не прошли анкету",
  homework_submitted: "Сдали домашнее задание",
  passed_homework: "Прошли домашнее задание",
  not_booked: "Прошли ДЗ, но не записались на собеседование",
  booked: "Записаны на собеседование",
  accepted: "Прошли отбор",
  staff: "Организаторы",
} as const;

export type Segment = keyof typeof SEGMENTS;
