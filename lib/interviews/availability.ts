import { INTERVIEW_BREAK_MS } from "./rules";
import { validInterval, type InterviewInterval } from "./import-table";

export function cutSlots(params: { date: string; from: string; to: string; duration: number; gap: number }): { startsAt: Date; endsAt: Date }[] {
  if (params.duration <= 0 || params.gap < 0) return [];
  const start = new Date(`${params.date}T${params.from}:00+03:00`);
  const end = new Date(`${params.date}T${params.to}:00+03:00`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) return [];
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  const step = params.duration * 60_000 + Math.max(INTERVIEW_BREAK_MS, params.gap * 60_000);
  for (let at = +start; at + params.duration * 60_000 <= +end; at += step) {
    slots.push({ startsAt: new Date(at), endsAt: new Date(at + params.duration * 60_000) });
    if (slots.length >= 40) break;
  }
  return slots;
}

export type PlannedInterview = { startsAt: Date; endsAt: Date; location: string; interviewerId: string; date: string };

/** Соседние свободные учебные интервалы — одно окно; обед/занятость не заполняем. */
export function availabilitySlots(rows: InterviewInterval[]): PlannedInterview[] {
  const ordered = rows.map(row => {
    if (!validInterval(row) || !row.location.trim() || row.location.length > 300 || !row.interviewerId) throw new Error("Проверьте дату, время, корпус и мастера в каждой строке.");
    return { ...row, location: row.location.trim(), startsAt: new Date(`${row.date}T${row.from}:00+03:00`), endsAt: new Date(`${row.date}T${row.to}:00+03:00`) };
  }).sort((a, b) => a.interviewerId.localeCompare(b.interviewerId) || +a.startsAt - +b.startsAt);
  const windows: typeof ordered = [];
  for (const row of ordered) {
    const prev = windows.at(-1);
    if (prev && prev.interviewerId === row.interviewerId && prev.endsAt > row.startsAt) throw new Error(`Пересекаются интервалы мастера (${row.date}).`);
    if (prev && prev.interviewerId === row.interviewerId && prev.date === row.date && prev.location === row.location && +row.startsAt - +prev.endsAt <= 10 * 60_000) {
      prev.to = row.to; prev.endsAt = row.endsAt;
    } else windows.push({ ...row });
  }
  const slots = windows.flatMap(window => cutSlots({ ...window, duration: 45, gap: 5 }).map(slot => ({ ...slot, location: window.location, interviewerId: window.interviewerId, date: window.date })));
  for (let i = 1; i < slots.length; i++) {
    const a = slots[i - 1]!, b = slots[i]!;
    if (a.interviewerId === b.interviewerId && +a.endsAt + INTERVIEW_BREAK_MS > +b.startsAt) throw new Error(`Между встречами мастера должно быть хотя бы 5 минут (${b.date}).`);
  }
  return slots;
}

/** Упорядоченное сопоставление с минимальным суммарным сдвигом времени. */
export function matchBookings(oldTimes: number[], newTimes: number[]): number[] | null {
  if (oldTimes.length > newTimes.length) return null;
  const dp = Array.from({ length: oldTimes.length + 1 }, () => Array<number>(newTimes.length + 1).fill(Infinity));
  const picked = Array.from({ length: oldTimes.length + 1 }, () => Array<boolean>(newTimes.length + 1).fill(false));
  dp[0]!.fill(0);
  for (let i = 1; i <= oldTimes.length; i++) for (let j = 1; j <= newTimes.length; j++) {
    const match = dp[i - 1]![j - 1]! + Math.abs(oldTimes[i - 1]! - newTimes[j - 1]!);
    const skip = dp[i]![j - 1]!;
    dp[i]![j] = Math.min(skip, match);
    picked[i]![j] = match <= skip;
  }
  const indices: number[] = [];
  let i = oldTimes.length, j = newTimes.length;
  while (i > 0 && j > 0) {
    if (picked[i]![j]) { indices.unshift(j - 1); i--; }
    j--;
  }
  return indices;
}
