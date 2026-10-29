import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import * as auditModule from "~~/lib/audit";
import { chooseSlot, loadCandidateAssessment } from "~~/lib/assessment/candidate";
import { loadSessionPage } from "~~/lib/assessment/sessions";
import * as assessmentSessions from "~~/lib/assessment/sessions";

import { acceptApplicationByStaff } from "./accept-by-staff";

describe("адресное принятие анкеты организатором", () => {
  const now = new Date("2035-10-27T10:00:00Z");
  const startsAt = new Date("2035-10-30T14:20:00Z");
  let seasonId: string;
  let actorId: string;
  let userId: string;
  let applicationId: string;
  let sessionId: string;
  let homeworkQuestionId: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "Сезон", year: 2035, isCurrent: true } })).id;
    await db.stage.create({ data: { seasonId, kind: "APPLICATION", title: "Анкета", order: 0, mode: "CLOSED" } });
    await db.stage.create({ data: { seasonId, kind: "ASSESSMENT", title: "Центр оценки", order: 3, mode: "OPEN" } });
    await db.formSection.createMany({ data: [
      { seasonId, stageKind: "APPLICATION", order: 0, title: "О себе", homework: false },
      { seasonId, stageKind: "APPLICATION", order: 1, title: "ДЗ", homework: true },
    ] });
    const about = await db.formQuestion.create({ data: { seasonId, stageKind: "APPLICATION", order: 0, section: "О себе", type: "LONG_TEXT", label: "О себе", required: true } });
    homeworkQuestionId = (await db.formQuestion.create({ data: { seasonId, stageKind: "APPLICATION", order: 1, section: "ДЗ", type: "URL", label: "Ссылка на ДЗ", required: true } })).id;
    actorId = (await db.user.create({ data: { firstName: "Организатор", isOwner: true } })).id;
    const role = await db.role.create({ data: { name: "Мастер", slug: "master", permissions: ["applications.review"] } });
    await db.user.create({ data: { firstName: "Мастер", roles: { create: { roleId: role.id } } } });
    userId = (await db.user.create({ data: { firstName: "Мария", lastName: "Примерова", middleName: "Тестовна", faculty: "ЮФ", course: "1", phone: "+79000000000" } })).id;
    applicationId = (await db.application.create({ data: { seasonId, userId, answers: { create: { questionId: about.id, value: "Сохранённый ответ" } } } })).id;
    const place = { building: "2", room: "101", startsAt: startsAt.toISOString(), note: null };
    sessionId = (await db.assessmentSession.create({ data: { seasonId, title: "ЮФ 17:20", startsAt, faculties: ["ЮФ"], capacity: 31, building: place.building, room: place.room, invited: place, invitedAt: now } })).id;
  });

  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  const call = () => acceptApplicationByStaff({ seasonId, userId, actorId, sessionId });

  it("принимает одну анкету без вымышленного ДЗ, пишет аудит и отправляет индивидуальное приглашение", async () => {
    const other = await db.user.create({ data: { firstName: "Другой", faculty: "ЮФ" } });
    const otherDraft = await db.application.create({ data: { seasonId, userId: other.id } });
    expect(await call()).toMatchObject({ ok: true, applicationId, homeworkPresent: false, invited: true });
    const app = await db.application.findUniqueOrThrow({ where: { id: applicationId }, include: { answers: true, submissions: true, reviews: true } });
    expect(app).toMatchObject({ status: "SUBMITTED", firstName: "Мария", lastName: "Примерова" });
    expect(app.answers.map((answer) => answer.value)).toContain("Сохранённый ответ");
    expect(app.submissions).toEqual([]);
    expect(app.reviews.map((review) => review.stageKind)).toEqual(["APPLICATION"]);
    expect((await db.application.findUniqueOrThrow({ where: { id: otherDraft.id } })).status).toBe("DRAFT");
    expect(await db.auditLog.findMany({ where: { entityId: applicationId } })).toMatchObject([{ actorId, action: "application.accept_by_staff", meta: { homeworkPresent: false } }]);
    expect(await db.notification.findMany({ where: { userId }, select: { title: true } })).toEqual([{ title: "Центр оценки — выберите время" }]);
    expect(await db.notification.count({ where: { userId: other.id } })).toBe(0);
    expect((await loadCandidateAssessment(userId, now))?.invite?.session.title).toBe("ЮФ 17:20");
    expect(await chooseSlot(userId, sessionId, now)).toMatchObject({ ok: true });
    expect((await loadSessionPage(seasonId, sessionId, true))?.answers.going.map((person) => person.applicationId)).toContain(applicationId);
  });

  it("сохраняет действительную ссылку как сдачу ДЗ и назначает проверку", async () => {
    await db.answer.create({ data: { applicationId, questionId: homeworkQuestionId, value: "https://drive.google.com/drive/folders/example" } });
    expect(await call()).toMatchObject({ ok: true, homeworkPresent: true, invited: true });
    const homework = await db.submission.findFirstOrThrow({ where: { applicationId, stageKind: "HOMEWORK", replacedAt: null } });
    expect(homework.text).toContain("https://drive.google.com/drive/folders/example");
    expect(await db.review.count({ where: { applicationId, stageKind: "HOMEWORK" } })).toBe(1);
  });

  it("не принимает битую ссылку за сданное ДЗ", async () => {
    await db.answer.create({ data: { applicationId, questionId: homeworkQuestionId, value: "это не ссылка" } });
    expect(await call()).toMatchObject({ ok: true, homeworkPresent: false });
    expect(await db.submission.count({ where: { applicationId, stageKind: "HOMEWORK" } })).toBe(0);
  });

  it("честно сообщает, если приглашение не удалось после принятия", async () => {
    vi.spyOn(assessmentSessions, "inviteSession").mockResolvedValueOnce({ ok: false, message: "Сбор недоступен" });
    expect(await call()).toMatchObject({ ok: true, invited: false, message: expect.stringContaining("не создано") });
    expect((await db.application.findUniqueOrThrow({ where: { id: applicationId } })).status).toBe("SUBMITTED");
    expect(await db.auditLog.count({ where: { action: "application.accept_by_staff", entityId: applicationId } })).toBe(1);
    expect(await db.assessmentInvite.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });

  it("проверяет факультет и опубликованный будущий сбор до принятия", async () => {
    await db.assessmentSession.update({ where: { id: sessionId }, data: { faculties: ["МЭО"] } });
    expect(await call()).toMatchObject({ ok: false });
    expect((await db.application.findUniqueOrThrow({ where: { id: applicationId } })).status).toBe("DRAFT");
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });

  it("не принимает анкету на неопубликованный или уже начавшийся сбор", async () => {
    await db.assessmentSession.update({ where: { id: sessionId }, data: { invitedAt: null } });
    expect(await call()).toMatchObject({ ok: false });
    await db.assessmentSession.update({ where: { id: sessionId }, data: { invitedAt: now } });
    vi.setSystemTime(new Date(startsAt.getTime() - 60 * 60 * 1000));
    expect(await call()).toMatchObject({ ok: false });
    expect((await db.application.findUniqueOrThrow({ where: { id: applicationId } })).status).toBe("DRAFT");
    expect(await db.notification.count()).toBe(0);
  });

  it("повтор не создаёт нового приглашения или уведомления", async () => {
    expect(await call()).toMatchObject({ ok: true, invited: true });
    expect(await call()).toMatchObject({ ok: false });
    expect(await db.assessmentInvite.count({ where: { applicationId } })).toBe(1);
    expect(await db.notification.count({ where: { userId } })).toBe(1);
  });

  it("два одновременных принятия не создают повторов", async () => {
    const results = await Promise.all([call(), call()]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "application.accept_by_staff", entityId: applicationId } })).toBe(1);
    expect(await db.assessmentInvite.count({ where: { applicationId } })).toBe(1);
    expect(await db.notification.count({ where: { userId } })).toBe(1);
  });

  it("не изменяет черновик заблокированного человека", async () => {
    await db.user.update({ where: { id: userId }, data: { status: "BLOCKED" } });
    expect(await call()).toMatchObject({ ok: false });
    expect((await db.application.findUniqueOrThrow({ where: { id: applicationId } })).status).toBe("DRAFT");
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });

  it("не принимает анкету организатором, пока обычный приём открыт", async () => {
    await db.stage.update({ where: { seasonId_kind: { seasonId, kind: "APPLICATION" } }, data: { mode: "OPEN" } });
    expect(await call()).toMatchObject({ ok: false, message: expect.stringContaining("после закрытия") });
    expect((await db.application.findUniqueOrThrow({ where: { id: applicationId } })).status).toBe("DRAFT");
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });

  it("не заменяет уже существующую сдачу ДЗ", async () => {
    await db.answer.create({ data: { applicationId, questionId: homeworkQuestionId, value: "https://example.org/new" } });
    const original = await db.submission.create({ data: { applicationId, stageKind: "HOMEWORK", text: "Сохранённая сдача" } });
    expect(await call()).toMatchObject({ ok: true, homeworkPresent: true });
    const submissions = await db.submission.findMany({ where: { applicationId, stageKind: "HOMEWORK" } });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ id: original.id, text: "Сохранённая сдача", replacedAt: null });
  });

  it("отменяет изменение статуса, если не удалось записать аудит", async () => {
    vi.spyOn(auditModule, "writeAudit").mockRejectedValueOnce(new Error("audit failed"));
    await expect(call()).rejects.toThrow("audit failed");
    expect((await db.application.findUniqueOrThrow({ where: { id: applicationId } })).status).toBe("DRAFT");
    expect(await db.assessmentInvite.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });
});
