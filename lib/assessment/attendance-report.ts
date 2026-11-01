import { mskDayKey, slotStartsAt, type AssessmentAnswerKind } from "./rules";

export interface AttendanceReportSession { id: string; startsAt: Date | string; invited: unknown; reserve: boolean }
export interface AttendanceReportPerson {
  id: string; name: string; faculty: string | null;
  invite: { attended: boolean; answer: AssessmentAnswerKind | null; reserveQueued: boolean; invitedDay: string | null; sessionId: string } | null;
}
export interface NonAttendanceGroup { key: string; day: string | null; reserve: boolean; people: { id: string; name: string; faculty: string | null }[] }

/** Один кандидат — один день. Неподтверждённый резерв не считается явкой. */
export function groupNonAttendance(year: number, sessions: AttendanceReportSession[], people: AttendanceReportPerson[], now = new Date()) {
  const today = mskDayKey(now);
  const byId = new Map(sessions.map(s => [s.id, s]));
  const reserve = [...sessions].filter(s => s.reserve).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.id.localeCompare(b.id));
  const reserveDays = [...new Set(reserve.map(s => mskDayKey(slotStartsAt(s))))];
  const sessionDays = sessions.map(s => mskDayKey(slotStartsAt(s)));
  const allFinished = sessionDays.length > 0 && sessionDays.every(day => day < today);
  const reserveFinished = reserveDays.length ? reserveDays.every(day => day < today) : allFinished;
  const groups = new Map<string, NonAttendanceGroup>();
  const group = (day: string | null, isReserve: boolean) => {
    const key = `${isReserve ? 'reserve' : 'day'}:${day ?? 'none'}`;
    if (!groups.has(key)) groups.set(key, { key, day, reserve: isReserve, people: [] });
    return groups.get(key)!;
  };
  for (const day of [...new Set([...Array.from({ length: 6 }, (_, i) => `${year}-10-${26 + i}`), ...sessionDays])].sort()) {
    if (day < today) group(day, day === `${year}-10-31` || reserveDays.includes(day));
  }
  for (const person of people) {
    const invite = person.invite;
    if (invite?.attended) continue;
    let day: string | null = null;
    let isReserve = false;
    if (invite && (invite.reserveQueued || invite.answer === 'RESERVE')) {
      isReserve = true;
      if (!reserveFinished && invite.reserveQueued) continue;
      if (invite.reserveQueued) day = reserveDays.length === 1 ? reserveDays[0]! : null;
      else day = reserve[0] ? mskDayKey(slotStartsAt(reserve[0])) : null;
      if (!day && !reserveFinished) continue;
    } else if (invite) {
      const session = byId.get(invite.sessionId);
      day = session && (session.reserve || invite.answer === 'GOING') ? mskDayKey(slotStartsAt(session)) : invite.invitedDay ?? (session ? mskDayKey(slotStartsAt(session)) : null);
      isReserve = Boolean(session?.reserve) || (day !== null && reserveDays.includes(day));
    }
    if (day ? day >= today : !allFinished) continue;
    group(day, isReserve).people.push({ id: person.id, name: person.name, faculty: person.faculty });
  }
  const days = [...groups.values()].sort((a, b) => (a.day ?? '9999').localeCompare(b.day ?? '9999') || Number(b.reserve) - Number(a.reserve));
  for (const day of days) day.people.sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
  return { days, total: days.reduce((sum, d) => sum + d.people.length, 0) };
}
