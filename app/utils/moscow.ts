import { TZDate, tz } from "@date-fns/tz";
import { format, isToday } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Всё время в интерфейсе — по Москве. Слоты, дедлайны и даты этапов
 * назначаются по Москве, и показывать их надо так же, где бы ни был браузер:
 * иначе кандидат из Екатеринбурга придёт на два часа раньше.
 *
 * Вторая причина — сервер стоит за рубежом. Без явного пояса страница,
 * нарисованная на сервере, показала бы UTC, а браузер — местное время.
 */
const TZ = "Europe/Moscow";
const inMoscow = tz(TZ);

export function mskTime(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(value));
}

export function mskDay(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(value));
}

export function mskDate(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: TZ }).format(new Date(value));
}

/** Ключ дня по Москве — чтобы группировать слоты по дням. */
export function mskDayKey(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).format(new Date(value));
}

/** Шаблон date-fns («d MMMM, HH:mm»), но всегда по Москве. */
export function mskFormat(value: Date | string, pattern: string): string {
  return format(new Date(value), pattern, { locale: ru, in: inMoscow });
}

export function mskIsToday(value: Date | string): boolean {
  return isToday(new Date(value), { in: inMoscow });
}

/** Значение для <input type="datetime-local">: поле без пояса, заполняем московским временем. */
export function mskInputValue(value: string | null): string {
  return value ? mskFormat(value, "yyyy-MM-dd'T'HH:mm") : "";
}

/** Обратно: «2026-10-15T23:59» из поля — это 23:59 по Москве. */
export function mskFromInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(new TZDate(year, month - 1, day, hour, minute, TZ).getTime()).toISOString();
}
