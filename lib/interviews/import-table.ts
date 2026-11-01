/** Строки, скопированные из таблицы: дата, с, до, корпус, имя мастера. */
export interface InterviewInterval {
  date: string;
  from: string;
  to: string;
  location: string;
  interviewerId: string;
}

export const normalizedMasterName = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru").replace(/ё/g, "е");

export function validInterval(row: Pick<InterviewInterval, "date" | "from" | "to">): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.from) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.to)) return false;
  const date = new Date(`${row.date}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === row.date && row.to > row.from;
}

export function parseInterviewTable(text: string, people: { id: string; name: string }[]): { rows: InterviewInterval[]; errors: string[] } {
  const rows: InterviewInterval[] = [];
  const errors: string[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const values = line.split("\t").map(s => s.trim());
    if (index === 0 && values[0]?.toLocaleLowerCase("ru") === "дата") continue;
    const [date = "", from = "", to = "", location = "", name = ""] = values;
    const matches = people.filter(p => normalizedMasterName(p.name) === normalizedMasterName(name));
    const row = { date, from, to, location, interviewerId: matches[0]?.id ?? "" };
    if (values.length !== 5 || !validInterval(row) || !location || location.length > 300 || matches.length !== 1) {
      errors.push(`Строка ${index + 1}: ${matches.length !== 1 ? `мастер «${name}» не найден однозначно` : "проверьте дату, время, корпус и пять столбцов"}.`);
    } else if (new Date(`${date}T${to}:00+03:00`).getTime() - new Date(`${date}T${from}:00+03:00`).getTime() < 45 * 60_000) {
      errors.push(`Строка ${index + 1}: интервал короче 45 минут.`);
    } else rows.push(row);
  }
  if (rows.length > 500) errors.push("За один раз можно добавить не больше 500 интервалов.");
  return { rows, errors };
}
