/**
 * Мелочи для графиков дашборда: круглые деления оси, числа по-русски,
 * столбик со скруглённой вершиной.
 */

/** Верх оси и деления по круглым числам: 0, 5, 10, 15, 20 — а не 0, 4.25, 8.5. Счётчики целые: шаг не меньше 1. */
export function niceScale(max: number, count = 4): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 1] };
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * power).find((value) => value >= raw) ?? raw);
  const top = Math.ceil(max / step) * step;
  return { max: top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

const integer = new Intl.NumberFormat("ru-RU");
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export const formatCount = (value: number) => integer.format(value);
export const formatScore = (value: number) => decimal.format(value);

/** Знак минуса — типографский, плюс явный: «+1,2», «−0,4». */
export function formatDelta(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${decimal.format(Math.abs(value))}`;
}

export function percentOf(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** Столбик от основания вверх: скруглена только вершина. */
export function columnPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.min(radius, width / 2, height);
  return `M${x} ${y + height}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + width - r}Q${x + width} ${y} ${x + width} ${y + r}V${y + height}Z`;
}

/** «1 работа», «3 работы», «5 работ». */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** «2026-10-05» → «5 окт.» — день уже московский, поэтому форматируем как UTC без сдвига. */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
}
