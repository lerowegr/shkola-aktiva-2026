import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { loadCandidateAssessment } from "./candidate";
import { autoInvite, deleteSession, inviteSession, loadOverview, loadSessionPage, notifyChange, remindSession, saveSession } from "./sessions";

describe("сборы центра оценки", () => {
  let seasonId: string;
  const now = new Date("2026-10-25T22:00:00.000Z"); // 01:00 по Москве — проверяем ночную доставку.

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function candidate(faculty: string | null, status: "SUBMITTED" | "DRAFT" = "SUBMITTED") {
    const user = await db.user.create({ data: { firstName: faculty ?? "Без", faculty } });
    return db.application.create({ data: { seasonId, userId: user.id, firstName: faculty ?? "Без", status, submittedAt: new Date() } });
  }
  const base = { building: "2", room: "Лекционная 305", note: "", reserve: false };
  async function session(title: string, faculties: string[], extra: Partial<typeof base & { startsAt: string }> = {}) {
    const result = await saveSession(seasonId, { title, startsAt: "2026-11-02T15:00:00.000Z", faculties, ...base, ...extra });
    if (!result.ok) throw new Error(result.message);
    return result.id;
  }

  async function startMailing(sessionId: string) {
    const first = await candidate("МЭО");
    expect(await inviteSession(seasonId, sessionId, [first.id])).toMatchObject({ ok: true, invited: 1 });
    await db.assessmentInvite.update({ where: { applicationId: first.id }, data: { answer: "GOING" } });
    return first;
  }

  it("ссылки на последнее сданное ДЗ видны в списках ЦО, включая просмотр без управления", async () => {
    const monday = await session("Пн", ["МЭО"]);
    const first = await startMailing(monday);
    const missing = await candidate("МЭО");
    await inviteSession(seasonId, monday, [missing.id]);
    await db.submission.createMany({ data: [
      { applicationId: first.id, stageKind: "HOMEWORK", text: "Старое: https://example.org/replaced", replacedAt: now },
      { applicationId: first.id, stageKind: "APPLICATION", text: "Анкета: https://example.org/profile" },
      { applicationId: first.id, stageKind: "HOMEWORK", text: "Ранняя сдача: https://example.org/earlier", submittedAt: new Date(now.getTime() - 1000) },
      { applicationId: first.id, stageKind: "HOMEWORK", text: "Задание 1: https://drive.google.com/drive/folders/current" },
    ] });
    const links = [{ label: "Задание 1", url: "https://drive.google.com/drive/folders/current" }];
    const page = await loadSessionPage(seasonId, monday, false);
    expect(page?.answers.going.find((p) => p.applicationId === first.id)?.homeworkLinks).toEqual(links);
    expect(page?.unassigned.find((p) => p.applicationId === first.id)?.homeworkLinks).toEqual(links);
    expect(page?.answers.silent.find((p) => p.applicationId === missing.id)?.homeworkLinks).toEqual([]);
    const group = await db.assessmentGroup.create({ data: { seasonId, sessionId: monday, title: "Подгруппа", faculty: "МЭО" } });
    await db.assessmentMember.create({ data: { groupId: group.id, applicationId: first.id } });
    const grouped = await loadSessionPage(seasonId, monday, true);
    expect(grouped?.groups[0]?.people[0]?.homeworkLinks).toEqual(links);
  });

  it("сбор без факультетов не создать, резервный день — один на сезон", async () => {
    expect(await saveSession(seasonId, { title: "Пн", startsAt: "2026-11-02T15:00:00.000Z", faculties: [], ...base })).toMatchObject({ ok: false });
    await session("Резерв", [], { reserve: true });
    expect(await saveSession(seasonId, { title: "Ещё", startsAt: "2026-11-03T15:00:00.000Z", faculties: [], ...base, reserve: true })).toMatchObject({
      ok: false,
    });
  });

  it("приглашает только свои факультеты и отправивших; повтор — 0; приглашённых на другой сбор пропускает", async () => {
    const snimk = await candidate("СНиМК");
    const meo = await candidate("МЭО");
    const law = await candidate("ЮФ");
    await candidate("МЭО", "DRAFT");
    const monday = await session("Пн: СНиМК и МЭО", ["СНиМК", "МЭО"]);

    expect(await inviteSession(seasonId, monday)).toMatchObject({ ok: true, invited: 2 });
    expect(await inviteSession(seasonId, monday)).toMatchObject({ ok: true, invited: 0 });
    const invited = (await db.assessmentInvite.findMany({ select: { applicationId: true } })).map((row) => row.applicationId).sort();
    expect(invited).toEqual([snimk.id, meo.id].sort());

    const notes = await db.notification.findMany({ where: { userId: snimk.userId } });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.url).toBe("/cabinet/assessment");
    expect(await db.notification.count({ where: { userId: law.userId } })).toBe(0);

    // На другой сбор уже приглашённых не зовём, даже явно.
    const tuesday = await session("Вт: все", ["СНиМК", "МЭО", "ЮФ"]);
    expect(await inviteSession(seasonId, tuesday, [snimk.id, law.id])).toMatchObject({ ok: true, invited: 1, skipped: 1 });
  });

  it("без места не пригласить; без факультета — только явно", async () => {
    const none = await candidate(null);
    const nowhere = await session("Где-то", ["МЭО"], { building: "", room: "" });
    expect(await inviteSession(seasonId, nowhere)).toMatchObject({ ok: false });
    const monday = await session("Пн", ["МЭО"]);
    expect(await inviteSession(seasonId, monday)).toMatchObject({ ok: true, invited: 0 });
    expect(await inviteSession(seasonId, monday, [none.id])).toMatchObject({ ok: true, invited: 1 });
    expect((await loadOverview(seasonId)).noFaculty).toBe(0);
  });

  it("счётчики: «резервный день» уходит в резервный сбор", async () => {
    const [a, b, c] = [await candidate("МЭО"), await candidate("МЭО"), await candidate("МЭО")];
    await candidate("МЭО");
    const monday = await session("Пн", ["МЭО"]);
    const reserve = await session("Резерв", [], { reserve: true, startsAt: "2026-10-31T09:00:00.000Z" });
    await inviteSession(seasonId, monday);
    await db.assessmentInvite.update({ where: { applicationId: a.id }, data: { answer: "GOING" } });
    await db.assessmentInvite.update({ where: { applicationId: b.id }, data: { answer: "RESERVE" } });
    await db.assessmentInvite.update({ where: { applicationId: c.id }, data: { answer: "CANT" } });

    const { sessions } = await loadOverview(seasonId);
    const row = (id: string) => sessions.find((item) => item.id === id)!;
    expect(row(monday).counts).toEqual({ invited: 4, going: 1, reserve: 1, cant: 1, silent: 1 });
    expect(row(reserve).counts.going).toBe(1);

    const page = await loadSessionPage(seasonId, reserve, true);
    expect(page!.unassigned.map((person) => person.applicationId)).toEqual([b.id]);
    const mondayPage = await loadSessionPage(seasonId, monday, true);
    // В нераспределённых понедельника — «буду» и молчащий, без «резерва» и «не смогу».
    expect(mondayPage!.unassigned).toHaveLength(1);
  });

  it("напоминание — только молчащим и не чаще раза в час", async () => {
    const [a, b] = [await candidate("МЭО"), await candidate("МЭО")];
    const monday = await session("Пн", ["МЭО"]);
    await inviteSession(seasonId, monday);
    await db.assessmentInvite.update({ where: { applicationId: a.id }, data: { answer: "GOING" } });

    expect(await remindSession(seasonId, monday)).toMatchObject({ ok: true, reminded: 1 });
    expect(await remindSession(seasonId, monday)).toMatchObject({ ok: false });
    expect(await db.notification.count({ where: { userId: b.userId } })).toBe(2);
    expect(await db.notification.count({ where: { userId: a.userId } })).toBe(1);
  });

  it("об изменении места — только после правки и только тем, чей это день, кроме «не смогу»", async () => {
    const [a, b] = [await candidate("МЭО"), await candidate("МЭО")];
    const monday = await session("Пн", ["МЭО"]);
    await inviteSession(seasonId, monday);
    await db.assessmentInvite.update({ where: { applicationId: b.id }, data: { answer: "CANT" } });
    await db.assessmentInvite.update({ where: { applicationId: a.id }, data: { answer: "GOING" } });
    expect(await notifyChange(seasonId, monday)).toMatchObject({ ok: false });

    await saveSession(seasonId, { id: monday, title: "Пн", startsAt: "2026-11-02T15:00:00.000Z", faculties: ["МЭО"], ...base, room: "410" });
    expect((await loadOverview(seasonId)).sessions[0]!.stale).toBe(true);
    expect(await notifyChange(seasonId, monday)).toMatchObject({ ok: true, sent: 1 });
    expect((await loadOverview(seasonId)).sessions[0]!.stale).toBe(false);
    expect(await db.notification.count({ where: { userId: a.userId } })).toBe(2);
    expect(await db.notification.count({ where: { userId: b.userId } })).toBe(1);
  });

  it("удаление сбора убирает приглашения и подгруппы", async () => {
    await candidate("МЭО");
    const monday = await session("Пн", ["МЭО"]);
    await inviteSession(seasonId, monday);
    await db.assessmentGroup.create({ data: { seasonId, sessionId: monday, title: "Подгруппа" } });
    expect(await deleteSession(seasonId, monday)).toMatchObject({ ok: true, invites: 1, groups: 1 });
    expect(await db.assessmentInvite.count()).toBe(0);
    expect(await db.assessmentGroup.count()).toBe(0);
  });

  it("поздняя анкета приглашается в ближайший будущий сбор с начатой рассылкой", async () => {
    const reserve = await session("Резерв", [], { reserve: true, startsAt: "2026-10-27T09:00:00.000Z" });
    await startMailing(reserve);
    await session("Ещё не приглашали", ["МЭО"], { startsAt: "2026-10-28T09:00:00.000Z" });
    const far = await session("Позже", ["МЭО"]);
    await startMailing(far);
    const near = await session("Ближе", ["МЭО"], { startsAt: "2026-10-29T09:00:00.000Z" });
    const first = await startMailing(near);
    const late = await candidate("МЭО");
    await db.user.update({ where: { id: late.userId }, data: { telegramId: "12345" } });

    expect(await autoInvite(late.id)).toBe(true);
    const invite = await db.assessmentInvite.findUniqueOrThrow({ where: { applicationId: late.id } });
    expect(invite.sessionId).toBe(near);
    const notifications = await db.notification.findMany({ where: { userId: late.userId } });
    const manual = await db.notification.findFirstOrThrow({ where: { userId: first.userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      key: `assessment-invite:${invite.id}`,
      url: "/cabinet/assessment",
      title: manual.title,
      body: manual.body,
    });
    const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { userId: late.userId } });
    expect(delivery.scheduledAt).toEqual(new Date(now.getTime() + 60_000));
  });

  it("до первой рассылки автоприглашения нет", async () => {
    const id = await session("Пн", ["МЭО"]);
    const late = await candidate("МЭО");
    expect(await autoInvite(late.id)).toBe(false);
    expect(await db.assessmentInvite.count()).toBe(0);
    expect((await db.assessmentSession.findUniqueOrThrow({ where: { id } })).invitedAt).toBeNull();
  });

  it.each([
    { reason: "без факультета", faculty: null, status: "SUBMITTED" as const, startsAt: "2026-11-02T15:00:00.000Z", reserve: false },
    { reason: "чужой факультет", faculty: "ЮФ", status: "SUBMITTED" as const, startsAt: "2026-11-02T15:00:00.000Z", reserve: false },
    { reason: "черновик", faculty: "МЭО", status: "DRAFT" as const, startsAt: "2026-11-02T15:00:00.000Z", reserve: false },
    { reason: "сбор уже начался", faculty: "МЭО", status: "SUBMITTED" as const, startsAt: now.toISOString(), reserve: false },
    { reason: "сбор в прошлом", faculty: "МЭО", status: "SUBMITTED" as const, startsAt: "2026-10-24T15:00:00.000Z", reserve: false },
    { reason: "только резервный сбор", faculty: "МЭО", status: "SUBMITTED" as const, startsAt: "2026-11-02T15:00:00.000Z", reserve: true },
  ])("автоприглашения нет: $reason", async ({ faculty, status, startsAt, reserve }) => {
    const id = await session("Сбор", ["МЭО"], { startsAt, reserve });
    await startMailing(id);
    const late = await candidate(faculty, status);
    expect(await autoInvite(late.id)).toBe(false);
    expect(await db.assessmentInvite.count({ where: { applicationId: late.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: late.userId } })).toBe(0);
  });

  it("не приглашает анкету другого сезона и заблокированного кандидата", async () => {
    const id = await session("Пн", ["МЭО"]);
    await startMailing(id);
    const late = await candidate("МЭО");
    await db.user.update({ where: { id: late.userId }, data: { status: "BLOCKED" } });
    expect(await autoInvite(late.id)).toBe(false);
    await db.user.update({ where: { id: late.userId }, data: { status: "ACTIVE" } });
    await db.season.update({ where: { id: seasonId }, data: { isCurrent: false } });
    expect(await autoInvite(late.id)).toBe(false);
    expect(await autoInvite("несуществующая-анкета")).toBe(false);
    expect(await db.assessmentInvite.count({ where: { applicationId: late.id } })).toBe(0);
  });

  it("уже приглашённого не переносит и не присылает повторное уведомление", async () => {
    const later = await session("Пн", ["МЭО"]);
    const first = await startMailing(later);
    const before = await db.assessmentInvite.findUniqueOrThrow({ where: { applicationId: first.id } });
    const nearer = await session("Раньше", ["МЭО"], { startsAt: "2026-10-29T09:00:00.000Z" });
    await startMailing(nearer);
    expect(await autoInvite(first.id)).toBe(false);
    expect(await db.assessmentInvite.findUnique({ where: { applicationId: first.id } })).toEqual(before);
    expect(await db.notification.count({ where: { userId: first.userId } })).toBe(1);
  });

  it("автоприглашение использует снимок и не публикует несообщённую правку места", async () => {
    await db.stage.create({ data: { seasonId, kind: "ASSESSMENT", title: "Центр оценки", order: 3 } });
    const id = await session("Пн", ["МЭО"]);
    await startMailing(id);
    const before = await db.assessmentSession.findUniqueOrThrow({ where: { id } });
    await db.assessmentSession.update({ where: { id }, data: { building: "Новый корпус", room: "410", startsAt: new Date("2026-11-03T10:00:00.000Z"), note: "Новое место" } });
    const late = await candidate("МЭО");

    expect(await autoInvite(late.id)).toBe(true);
    const after = await db.assessmentSession.findUniqueOrThrow({ where: { id } });
    expect(after.invited).toEqual(before.invited);
    expect(after.invitedAt).toEqual(before.invitedAt);
    const view = await loadCandidateAssessment(late.userId, now);
    expect(view!.invite!.day).toBeNull();
    expect(view!.invite!.session).toMatchObject({ building: "2", room: "Лекционная 305", startsAt: "2026-11-02T15:00:00.000Z" });
    const note = await db.notification.findFirstOrThrow({ where: { userId: late.userId } });
    expect(note.body).toContain("факультет МЭО");
    expect(note.body).not.toContain("410");
    expect((await loadOverview(seasonId)).sessions[0]!.stale).toBe(true);
  });

  it("повторное ручное приглашение не меняет снимок до сообщения об изменении", async () => {
    const id = await session("Пн", ["МЭО"]);
    await startMailing(id);
    const before = await db.assessmentSession.findUniqueOrThrow({ where: { id } });
    await db.assessmentSession.update({ where: { id }, data: { room: "410" } });
    const late = await candidate("МЭО");

    expect(await inviteSession(seasonId, id)).toEqual({
      ok: false,
      message: "Место или время сбора изменились после приглашения — сначала нажмите «Сообщить об изменении», потом приглашайте новых.",
    });
    const after = await db.assessmentSession.findUniqueOrThrow({ where: { id } });
    expect(after.invited).toEqual(before.invited);
    expect(after.invitedAt).toEqual(before.invitedAt);
    expect(await db.assessmentInvite.count({ where: { applicationId: late.id } })).toBe(0);
    expect(await notifyChange(seasonId, id)).toMatchObject({ ok: true, sent: 1 });
    expect(await inviteSession(seasonId, id)).toMatchObject({ ok: true, invited: 1 });
    expect((await db.assessmentSession.findUniqueOrThrow({ where: { id } })).invited).toMatchObject({ room: "410" });
  });

  it("одновременные автоприглашения создают одно приглашение и уведомление", async () => {
    const id = await session("Пн", ["МЭО"]);
    await startMailing(id);
    const late = await candidate("МЭО");
    expect((await Promise.all([autoInvite(late.id), autoInvite(late.id)])).sort()).toEqual([false, true]);
    expect(await db.assessmentInvite.count({ where: { applicationId: late.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: late.userId } })).toBe(1);
  });

  it("приглашение и изменение срочные, напоминание ночью ждёт утра", async () => {
    const a = await candidate("МЭО");
    await db.user.update({ where: { id: a.userId }, data: { telegramId: "12345" } });
    const id = await session("Пн", ["МЭО"]);
    await inviteSession(seasonId, id);
    await remindSession(seasonId, id);
    await db.assessmentInvite.update({ where: { applicationId: a.id }, data: { answer: "GOING" } });
    await db.assessmentSession.update({ where: { id }, data: { room: "410" } });
    await notifyChange(seasonId, id);
    const deliveries = await db.notificationDelivery.findMany({ where: { userId: a.userId }, include: { notification: true } });
    expect(deliveries).toHaveLength(3);
    const at = (prefix: string) => deliveries.find((item) => item.notification.key?.startsWith(prefix))!.scheduledAt;
    expect(at("assessment-invite:")).toEqual(new Date(now.getTime() + 60_000));
    expect(at("assessment-change:")).toEqual(new Date(now.getTime() + 60_000));
    expect(at("assessment-remind:")).toEqual(new Date("2026-10-26T05:00:00.000Z"));
  });

  it("ошибка автоприглашения логируется и не выходит наружу", async () => {
    vi.spyOn(db.application, "findFirst").mockRejectedValueOnce(new Error("База недоступна"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await autoInvite("application")).toBe(false);
    expect(log).toHaveBeenCalledWith("Не удалось автоматически пригласить на центр оценки", expect.any(Error));
  });
});
