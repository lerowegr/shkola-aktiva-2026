import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { nonAttendanceReport } from "./non-attendance";

beforeEach(resetDatabase);
describe('список не прошедших ЦО', () => {
  it('только отправленные анкеты, фильтр факультета, живая отметка явки', async () => {
    const season = await db.season.create({ data: { slug: 's', title: 'S', year: 2026 } });
    const session = await db.assessmentSession.create({ data: { seasonId: season.id, title: 'ЦО', startsAt: new Date('2026-10-26T14:20:00Z') } });
    const ids: string[] = [];
    for (const [faculty, status] of [['ЮФ','SUBMITTED'],['МЭО','SUBMITTED'],['ЮФ','DRAFT']] as const) {
      const user = await db.user.create({ data: { faculty } });
      const app = await db.application.create({ data: { seasonId: season.id, userId: user.id, status, lastName: faculty, firstName: 'Кандидат' } });
      ids.push(app.id);
      await db.assessmentInvite.create({ data: { applicationId: app.id, sessionId: session.id, answer: 'GOING', attended: false } });
    }
    const now = new Date('2026-11-01T12:00:00Z');
    expect((await nonAttendanceReport(season.id, '', now)).total).toBe(2);
    expect((await nonAttendanceReport(season.id, 'ЮФ', now)).days.flatMap(d => d.people.map(p => p.id))).toEqual([ids[0]]);
    await db.assessmentInvite.update({ where: { applicationId: ids[0]! }, data: { attended: true } });
    expect((await nonAttendanceReport(season.id, 'ЮФ', now)).total).toBe(0);
  });
});
