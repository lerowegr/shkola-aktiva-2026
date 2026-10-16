/**
 * Сегменты рассылок — отдельным файлом без обращений к базе: список нужен и
 * странице в браузере, и серверу.
 */
export const SEGMENTS = {
  candidates: "Все кандидаты",
  drafts: "Начали анкету, но не отправили",
  submitted: "Отправили анкету",
  homework_submitted: "Сдали домашнее задание",
  in_assessment: "Распределены в группы центра оценки",
  not_booked: "Отправили анкету, но не записались на собеседование",
  booked: "Записаны на собеседование",
  accepted: "Прошли отбор",
  rejected: "Не прошли отбор",
  staff: "Организаторы",
} as const;

export type Segment = keyof typeof SEGMENTS;
