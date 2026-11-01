import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { previewInvitations, sendInvitations, interviewInviteIsCurrent } from "./invitations";

beforeEach(resetDatabase);
describe('ручное приглашение на собеседования', () => {
  it('до открытия: все факультеты, только прошедшие ЦО без записи; повтор не дублирует', async () => {
    const season = await db.season.create({ data: { slug:'s', title:'S', year:2026, isCurrent:true } });
    await db.stage.create({ data: { seasonId:season.id, kind:'INTERVIEW', title:'Собес', order:4, opensAt:new Date('2026-11-02T05:00:00Z'), closesAt:new Date('2026-11-08T20:59:00Z') } });
    const owner = await db.user.create({ data:{isOwner:true} });
    const co = await db.assessmentSession.create({data:{seasonId:season.id,title:'ЦО',startsAt:new Date('2026-10-31T10:00:00Z')}});
    const users: string[] = [];
    const apps: string[] = [];
    for (const [faculty,attended] of [['ЮФ',true],['МЭО',true],['ВШУ',false],['ФФ',true]] as const) {
      const user = await db.user.create({data:{faculty}});users.push(user.id);
      const app = await db.application.create({data:{seasonId:season.id,userId:user.id,status:'SUBMITTED'}});apps.push(app.id);
      await db.assessmentInvite.create({data:{applicationId:app.id,sessionId:co.id,attended}});
    }
    const slot = await db.interviewSlot.create({data:{seasonId:season.id,location:'Корпус',startsAt:new Date('2026-11-03T07:00:00Z'),endsAt:new Date('2026-11-03T07:20:00Z'),interviewers:{create:{userId:owner.id}}}});
    await db.interviewBooking.create({data:{slotId:slot.id,applicationId:apps[3]!}});
    const now = new Date('2026-11-01T12:00:00Z');
    const preview = await previewInvitations(season.id,now);
    expect(preview?.count).toBe(2);expect(preview?.text).toContain('08:00');expect(preview?.text).toContain('Привет!');
    expect(await sendInvitations(season.id,users[0]!,now)).toMatchObject({ok:false});
    expect(await sendInvitations(season.id,owner.id,now)).toMatchObject({ok:true,count:2});
    expect(await sendInvitations(season.id,owner.id,now)).toMatchObject({ok:true,count:0});
    const invited = await db.notification.findMany({where:{key:`interview-invite:${season.id}`},select:{userId:true}});
    expect(invited.map(n=>n.userId).sort()).toEqual(users.slice(0,2).sort());
    expect(await interviewInviteIsCurrent(`interview-invite:${season.id}`,users[0]!,now)).toBe(true);
    await db.assessmentInvite.update({where:{applicationId:apps[0]!},data:{attended:false}});
    expect(await interviewInviteIsCurrent(`interview-invite:${season.id}`,users[0]!,now)).toBe(false);
    expect(await interviewInviteIsCurrent(`interview-invite:${season.id}`,users[3]!,now)).toBe(false);
  });
});
