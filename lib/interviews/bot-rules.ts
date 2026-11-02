/** Даты бота независимо от пояса сервера; строгое чтение без автокоррекции дат. */
export function botDay(now = new Date(), offset = 0): string {
  return new Date(+now + 3 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
}
export function validBotDay(value: string): boolean {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+new Date(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function parseBotDay(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(20\d{2})$/);
  const day = m ? `${m[3]}-${m[2]}-${m[1]}` : value.trim();
  return validBotDay(day) ? day : null;
}
export function parseBotTime(value: string): Date | null {
  const m = value.trim().match(/^(\d{2}\.\d{2}\.20\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  const day = parseBotDay(m[1]!);
  return day ? new Date(`${day}T${m[2]}:${m[3]}:00+03:00`) : null;
}
export const botWhen = (at: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at);
export const botTime = (at: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).format(at);
