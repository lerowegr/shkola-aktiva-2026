/**
 * Чистые помощники лендинга: сколько осталось до конца приёма анкет и
 * какие события истории показать на главной. Без базы — их зовёт и
 * страница в браузере.
 */

const moscowDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );

/** Календарные дни по Москве между двумя моментами. */
function moscowDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${moscowDay(from)}T00:00:00Z`);
  const b = Date.parse(`${moscowDay(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * «Осталось 13 дней», «остался 1 день», «последний день» — до закрытия
 * анкеты по Москве. Нет даты или уже закрыто — null: строку не показываем.
 */
export function daysLeft(closesAt: string | Date | null, now: Date = new Date()): string | null {
  if (!closesAt) return null;
  const end = new Date(closesAt);
  if (end <= now) return null;

  const days = moscowDaysBetween(now, end);
  if (days <= 0) return "последний день";
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `остался ${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `осталось ${days} дня`;
  return `осталось ${days} дней`;
}

/** Год события как число — по цифрам в начале строки («2024», «2024–2025»). */
function yearOf(year: string): number | null {
  const match = /^\s*(\d{4})/.exec(year);
  return match ? Number(match[1]) : null;
}

/**
 * Последние события для главной: по году, свежие первыми; без числа в
 * году — в конце; при равных годах — как расставили организаторы.
 */
export function latestEvents<T extends { year: string }>(items: readonly T[], count = 3): T[] {
  return items
    .map((item, index) => ({ item, index, year: yearOf(item.year) }))
    .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || a.index - b.index)
    .slice(0, count)
    .map(({ item }) => item);
}

/** Все события по годам для таймлайна: старые сверху, как читают историю. */
export function timeline<T extends { year: string }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, year: yearOf(item.year) }))
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);
}
