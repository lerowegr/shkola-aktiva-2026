/**
 * Чистая математика календаря для брендового выбора даты и времени.
 * Недели начинаются с понедельника, месяцы — числами 0…11, пояс не важен:
 * все значения — московское стенное время из полей (см. moscow.ts).
 */
export interface DayCell {
  year: number;
  month: number;
  day: number;
  current: boolean;
}

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** 42 клетки (6×7) месяца: leading — хвост прошлого, trailing — начало следующего. */
export function monthGrid(year: number, month: number): DayCell[] {
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: DayCell[] = [];
  for (let i = leading - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevDays - i);
    cells.push({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), current: false });
  }
  for (let day = 1; day <= days; day++) cells.push({ year, month, day, current: true });
  let next = 1;
  while (cells.length < 42) {
    const date = new Date(year, month + 1, next++);
    cells.push({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), current: false });
  }
  return cells;
}

/** «октябрь 2026» — строчными, как в системном календаре. */
export function monthName(year: number, month: number): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function validDate(year: number, month: number, day: number): boolean {
  return month >= 0 && month < 12 && day >= 1 && day <= new Date(year, month + 1, 0).getDate();
}

function validTime(hour: number, minute: number): boolean {
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
}

/** «2026-10-09T12:30» → части. Мусор и невозможные даты — null. */
export function parseDateTime(value: string): DateTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
  if (!validDate(year, month - 1, day) || !validTime(hour, minute)) return null;
  return { year, month: month - 1, day, hour, minute };
}

export function formatDateTime(parts: DateTimeParts): string {
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  if (!validDate(year, month - 1, day)) return null;
  return { year, month: month - 1, day };
}

export function formatDate(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}`;
}

export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, hour, minute] = match.map(Number) as [number, number, number];
  if (!validTime(hour, minute)) return null;
  return { hour, minute };
}

export function formatTime(parts: { hour: number; minute: number }): string {
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}
