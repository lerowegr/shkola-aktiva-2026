import { db } from "~~/lib/db";

import { implausible } from "./rules";

/**
 * Ежедневное задание: одна головоломка в день, серия дней подряд.
 *
 * Отдельно от обычных игр: попытка одна в день, рейтинг — длина серии,
 * а не очки. День и сид выводятся из даты по Москве, поэтому таблицу
 * самих заданий хранить не нужно: один и тот же день даёт всем одно и то
 * же задание. Решения — в DailySolution (уникальность пары человек+день).
 */
export type DailyKind = "MEMORY" | "PIXEL" | "QUIZ";

const ROTATION: DailyKind[] = ["MEMORY", "PIXEL", "QUIZ"];

/** День YYYY-MM-DD по Москве. */
export function mskDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(now);
}

/** Час дня 0…23 по Москве. */
export function mskHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", hour12: false, timeZone: "Europe/Moscow" }).format(now));
}

/** Сид дня: одинаковый у всех, детерминированный. */
export function seedFromDate(date: string): number {
  let hash = 2166136261;
  for (const char of date) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Вид задания дня — ротация по числу суток. */
export function dailyKind(date: string): DailyKind {
  const days = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
  return ROTATION[((days % ROTATION.length) + ROTATION.length) % ROTATION.length]!;
}

export function addDays(date: string, days: number): string {
  const time = new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/** Серия: current — подряд до сегодня/вчера, best — лучшая ever. */
export function streakOf(dates: string[], today: string): { current: number; best: number } {
  const solved = new Set(dates);
  let best = 0;
  let run = 0;
  const sorted = [...solved].sort();
  let previous = "";
  for (const date of sorted) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  let current = 0;
  // Сегодня решено — считаем назад от сегодня, иначе от вчера: вчерашняя
  // серия ещё жива, пока сегодняшний день не кончился.
  let cursor = solved.has(today) ? today : addDays(today, -1);
  while (solved.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

export interface DailyStatus {
  date: string;
  kind: DailyKind;
  seed: number;
  solved: boolean;
  streak: number;
  best: number;
}

export async function dailyStatus(userId: string, now = new Date()): Promise<DailyStatus> {
  const date = mskDate(now);
  const solutions = await db.dailySolution.findMany({
    where: { userId },
    select: { date: true },
    orderBy: { date: "asc" },
  });
  const { current, best } = streakOf(solutions.map((row) => row.date), date);
  return {
    date,
    kind: dailyKind(date),
    seed: seedFromDate(date),
    solved: solutions.some((row) => row.date === date),
    streak: current,
    best,
  };
}

export type SolveDailyResult = { ok: true; streak: number; best: number } | { ok: false; message: string };

export async function solveDaily(
  userId: string,
  input: { kind: DailyKind; score: number; moves?: number | null; timeMs: number },
  now = new Date(),
): Promise<SolveDailyResult> {
  const date = mskDate(now);
  if (input.kind !== dailyKind(date)) {
    return { ok: false, message: "Это задание уже не сегодняшнее. Откройте новое." };
  }
  const problem = implausible({ game: input.kind, score: input.score, moves: input.moves ?? null, durationMs: input.timeMs });
  // Партия ежедневного — та же форма, что обычная (тот же компонент, тот же
  // сид у всех), поэтому диапазоны правдоподобия общие.
  if (problem) return { ok: false, message: problem };

  try {
    await db.dailySolution.create({ data: { userId, date, kind: input.kind, score: input.score, timeMs: input.timeMs } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, message: "Сегодняшнее задание уже решено." };
    }
    console.error("Не получилось сохранить задание дня", error);
    return { ok: false, message: "Не получилось сохранить. Попробуйте ещё раз." };
  }
  const status = await dailyStatus(userId, now);
  return { ok: true, streak: status.streak, best: status.best };
}

/** Сколько кандидатов решает ежедневные (для дашборда): игроки и решения. */
