import { mskDayKey, mskTime } from "~~/app/utils/moscow";

export interface InterviewExportSlot { startsAt: Date; endsAt: Date; location: string; room: string | null; master: string; candidate: string | null }
export interface InterviewExportDay { date: string; name: string; times: string[]; masters: string[]; cells: Map<string, string> }
const weekday = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
export function buildInterviewExport(slots: InterviewExportSlot[]): InterviewExportDay[] {
  const groups = new Map<string, InterviewExportSlot[]>();
  for (const slot of slots) {
    const date = mskDayKey(slot.startsAt);
    groups.set(date, [...(groups.get(date) ?? []), slot]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => {
    const times = [...new Set(day.map(s => `${mskTime(s.startsAt)}–${mskTime(s.endsAt)}`))].sort((a, b) => a.localeCompare(b));
    const masters = [...new Set(day.map(s => s.master))].sort((a, b) => a.localeCompare(b, "ru"));
    const cells = new Map<string, string>();
    for (const s of day) {
      const time = `${mskTime(s.startsAt)}–${mskTime(s.endsAt)}`;
      const key = `${s.master}\0${time}`;
      const value = `${s.candidate ?? "Свободно"}\n${s.location}${s.room ? ` · ${s.room}` : ""}`;
      cells.set(key, cells.has(key) ? `${cells.get(key)}\n\n${value}` : value);
    }
    const [, month, dayOfMonth] = date.split("-");
    return { date, name: `${weekday[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${dayOfMonth}.${month}`, times, masters, cells };
  });
}
