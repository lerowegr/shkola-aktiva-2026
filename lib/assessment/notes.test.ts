import { beforeEach, describe, expect, it } from "vitest";

import { saveText } from "~~/lib/applications/review-store";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteTask, loadNotes, noteAccess, saveGroupNote, saveTask, saveTaskNote } from "./notes";

describe("комментарии центра оценки", () => {
  let seasonId: string;
  let groupId: string;
  let applicationId: string;
  let taskId: string;
  let kate: { id: string };
  let ilya: { id: string };
  let outsider: { id: string };

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    const role = await db.role.create({ data: { name: "Мастер", slug: "master", permissions: ["applications.review"] } });
    const expert = (name: string) => db.user.create({ data: { firstName: name, roles: { create: { roleId: role.id } } } });
    [kate, ilya, outsider] = [await expert("Катя"), await expert("Илья"), await expert("Чужой")];
    const session = await db.assessmentSession.create({ data: { seasonId, title: "Пн", startsAt: new Date(), faculties: ["МЭО"] } });
    groupId = (await db.assessmentGroup.create({ data: { seasonId, sessionId: session.id, title: "Подгруппа" } })).id;
    await db.assessmentExpert.createMany({ data: [{ groupId, userId: kate.id }, { groupId, userId: ilya.id }] });
    const user = await db.user.create({ data: { firstName: "А" } });
    applicationId = (await db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED", submittedAt: new Date() } })).id;
    await db.assessmentMember.create({ data: { groupId, applicationId } });
    taskId = (await db.assessmentTask.create({ data: { seasonId, title: "Рефлексия", order: 1 } })).id;
  });

  it("эксперт подгруппы пишет своё, чужой — нет; пустое стирает", async () => {
    expect(await saveTaskNote(seasonId, { applicationId, taskId, authorId: kate.id, text: "Взяла роль ведущей" })).toEqual({ ok: true });
    expect(await saveTaskNote(seasonId, { applicationId, taskId, authorId: outsider.id, text: "Чужое" })).toMatchObject({ ok: false });
    expect(await saveGroupNote(seasonId, { groupId, authorId: ilya.id, text: "Группа активная" })).toEqual({ ok: true });
    expect(await saveGroupNote(seasonId, { groupId, authorId: outsider.id, text: "Чужое" })).toMatchObject({ ok: false });

    const notes = (await loadNotes(seasonId, groupId, kate.id))!;
    expect(notes.columns.map((column) => column.name)).toEqual(["Илья", "Катя"]);
    expect(notes.taskNotes).toEqual([{ taskId, applicationId, authorId: kate.id, text: "Взяла роль ведущей" }]);
    expect(notes.groupNotes).toEqual([{ authorId: ilya.id, text: "Группа активная" }]);

    await saveTaskNote(seasonId, { applicationId, taskId, authorId: kate.id, text: "  " });
    expect(await db.assessmentTaskNote.count()).toBe(0);
    // Журнал — не на каждую букву.
    await saveGroupNote(seasonId, { groupId, authorId: ilya.id, text: "Группа активная, но устала" });
    expect(await db.auditLog.count({ where: { action: "assessment.group_note" } })).toBe(1);
  });

  it("читают эксперты подгруппы и «все анкеты», пишут — только эксперты", async () => {
    const actor = (id: string, permissions: string[]) => ({ id, permissions, isOwner: false, isActive: true });
    expect(await noteAccess(actor(kate.id, ["applications.review"]), groupId)).toEqual({ read: true, write: true });
    expect(await noteAccess(actor(outsider.id, ["applications.review"]), groupId)).toEqual({ read: false, write: false });
    expect(await noteAccess(actor(outsider.id, ["applications.view_all"]), groupId)).toEqual({ read: true, write: false });
  });

  it("комментарий к баллу — только к своему поставленному баллу", async () => {
    const criterion = await db.criterion.create({ data: { seasonId, stageKind: "ASSESSMENT", order: 1, title: "Командность", maxScore: 2, levels: [] } });
    const review = await db.review.create({ data: { applicationId, stageKind: "ASSESSMENT", reviewerId: kate.id } });
    const field = `score:${criterion.id}`;

    expect(await saveText({ reviewId: review.id, actorId: kate.id, field, value: "Почему" })).toMatchObject({ ok: false });
    await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: 2 } });
    expect(await saveText({ reviewId: review.id, actorId: ilya.id, field, value: "Чужое" })).toMatchObject({ ok: false });
    expect(await saveText({ reviewId: review.id, actorId: kate.id, field, value: "Собрала команду" })).toMatchObject({ ok: true });
    expect((await db.reviewScore.findFirstOrThrow()).comment).toBe("Собрала команду");
  });

  it("задание с комментариями не удалить — только выключить", async () => {
    await saveTaskNote(seasonId, { applicationId, taskId, authorId: kate.id, text: "Есть" });
    expect(await deleteTask(seasonId, taskId)).toMatchObject({ ok: false });
    expect(await saveTask(seasonId, { id: taskId, title: "Рефлексия", active: false })).toMatchObject({ ok: true, created: false });
    expect((await loadNotes(seasonId, groupId, kate.id))!.tasks).toEqual([]);
    const fresh = await saveTask(seasonId, { title: "Новое" });
    expect(fresh).toMatchObject({ ok: true, created: true });
    if (fresh.ok) expect(await deleteTask(seasonId, fresh.id)).toMatchObject({ ok: true });
  });
});
