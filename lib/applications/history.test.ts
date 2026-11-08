import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~~/lib/db';
import { loadUser } from '~~/lib/auth/actor';
import { resetDatabase } from '~~/lib/test/db';
import { loadReviewHistory } from './history';

beforeEach(resetDatabase);
describe('предыдущие оценки собеседования',()=>{
  it('свой мастер и владелец видят критерии/проценты/комментарии, кандидат и посторонний мастер — нет',async()=>{
    const season=await db.season.create({data:{slug:'s',title:'S',year:2026}});
    const role=await db.role.create({data:{name:'М',slug:'m',permissions:['applications.review']}});
    const master=await db.user.create({data:{firstName:'Мастер',roles:{create:{roleId:role.id}}}});
    const stranger=await db.user.create({data:{roles:{create:{roleId:role.id}}}});
    const outsider=await db.user.create({data:{roles:{create:{roleId:role.id}}}});
    const candidate=await db.user.create({data:{}});const owner=await db.user.create({data:{isOwner:true}});
    const app=await db.application.create({data:{seasonId:season.id,userId:candidate.id,status:'SUBMITTED'}});
    await db.review.create({data:{applicationId:app.id,stageKind:'INTERVIEW',reviewerId:master.id,comment:'Итог собеседования'}});
    const a=await db.criterion.create({data:{seasonId:season.id,stageKind:'HOMEWORK',order:1,title:'A',maxScore:2,levels:[]}});
    const b=await db.criterion.create({data:{seasonId:season.id,stageKind:'HOMEWORK',order:2,title:'B',maxScore:4,levels:[]}});
    await db.review.create({data:{applicationId:app.id,stageKind:'HOMEWORK',reviewerId:stranger.id,comment:'Комментарий прежнего мастера',scores:{create:[{criterionId:a.id,score:2,comment:'Убедительно'},{criterionId:b.id,score:2}]}}});
    const result=await loadReviewHistory(app.id,season.id,(await loadUser(master.id))!);
    expect(result && result.stages.find(s=>s.label==='Домашнее задание')?.reviews[0]).toMatchObject({percent:67,total:4,max:6,comment:'Комментарий прежнего мастера'});
    expect(result && result.stages.find(s=>s.label==='Домашнее задание')?.reviews[0]?.criteria[0]?.comment).toBe('Убедительно');
    expect(result && result.stages.find(s=>s.label==='Собеседование')?.reviews[0]?.comment).toBe('Итог собеседования');
    expect(await loadReviewHistory(app.id,season.id,(await loadUser(owner.id))!)).toBeTruthy();
    expect(await loadReviewHistory(app.id,season.id,(await loadUser(candidate.id))!)).toBe(false);
    expect(await loadReviewHistory(app.id,season.id,(await loadUser(stranger.id))!)).toBeTruthy();
    expect(await loadReviewHistory(app.id,season.id,(await loadUser(outsider.id))!)).toBe(false);
  });
});
