import { describe, expect, it } from "vitest";
import { groupNonAttendance, type AttendanceReportPerson, type AttendanceReportSession } from "./attendance-report";
const now = new Date("2026-11-01T12:00:00Z");
const sessions: AttendanceReportSession[] = [
  { id: 'mon', startsAt: '2026-10-26T14:20:00Z', invited: null, reserve: false },
  { id: 'tue', startsAt: '2026-10-27T14:20:00Z', invited: null, reserve: false },
  { id: 'reserve', startsAt: '2026-10-31T14:20:00Z', invited: null, reserve: true },
];
const person = (id: string, changes: Partial<NonNullable<AttendanceReportPerson['invite']>> = {}): AttendanceReportPerson => ({ id, name: id, faculty: 'ЮФ', invite: { attended: false, answer: 'GOING', reserveQueued: false, invitedDay: '2026-10-26', sessionId: 'mon', ...changes } });
describe('ЦО не пройден по дням', () => {
  it('один человек один раз; явка исключает независимо от ответа; резерв не остаётся в исходном дне', () => {
    const people = [person('selected', { sessionId: 'tue' }), person('silent', { answer: null }), person('queue', { answer: 'RESERVE', reserveQueued: true }), person('legacy', { answer: 'RESERVE' }), person('declined-reserve', { answer: 'CANT', sessionId: 'reserve', invitedDay: '2026-10-30' }), person('attended-silent', { attended: true, answer: null }), { ...person('no-invite'), invite: null }];
    const report = groupNonAttendance(2026, sessions, people, now);
    expect(report.total).toBe(6);
    expect(report.days.find(d => d.day === '2026-10-26')?.people.map(p => p.id)).toEqual(['silent']);
    expect(report.days.find(d => d.day === '2026-10-27')?.people.map(p => p.id)).toEqual(['selected']);
    expect(report.days.find(d => d.day === '2026-10-31' && d.reserve)?.people.map(p => p.id)).toEqual(['declined-reserve', 'legacy', 'queue']);
    expect(report.days.find(d => d.day === null && !d.reserve)?.people.map(p => p.id)).toEqual(['no-invite']);
    const ids = report.days.flatMap(d => d.people.map(p => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('сегодняшние/будущие дни не объявляются завершёнными; несколько резервных дней не подменяются одним', () => {
    const multiple = [...sessions, { ...sessions[2]!, id: 'reserve2', startsAt: '2026-10-30T14:20:00Z' }];
    const queue = person('queue', { answer: 'RESERVE', reserveQueued: true });
    const report = groupNonAttendance(2026, multiple, [queue], now);
    expect(report.days.find(d => d.day === null && d.reserve)?.people.map(p => p.id)).toEqual(['queue']);
    expect(groupNonAttendance(2026, sessions, [queue], new Date('2026-10-31T20:59:59Z')).total).toBe(0);
    expect(groupNonAttendance(2026, sessions, [queue], new Date('2026-10-31T21:00:00Z')).total).toBe(1);
  });
});
