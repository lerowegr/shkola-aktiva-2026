import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { availabilitySlots, cutSlots, matchBookings } from "./availability";
import { reflowSchedule } from "./reflow";
import { book, loadInterview } from "./booking";
import { restoreSlot } from "./manage";
import { checkOverlap } from "./scheduling";
import { interviewReminderIsCurrent } from "./reminders";
import { previewReserveInvitations, scheduleReserveInvitations, materializeReserveInvitations } from "./reserve-invitations";

const now = new Date("2026-11-01T12:00:00+03:00");
beforeEach(resetDatabase);
async function setup() {
  const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
  await db.stage.create({ data: { seasonId: season.id, kind: "INTERVIEW", title: "Собес", order: 4, mode: "OPEN" } });
  const master = await db.user.create({ data: { isOwner: true, firstName: "СкрытоеИмяМастера", telegramId: "999001" } });
  const user = await db.user.create({ data: { telegramId: "999002" } });
  const app = await db.application.create({ data: { seasonId: season.id, userId: user.id, status: "SUBMITTED", firstName: "Участник" } });
  const session = await db.assessmentSession.create({ data: { seasonId: season.id, title: "Резерв", reserve: true, startsAt: new Date("2026-10-31T12:40:00Z") } });
  const group = await db.assessmentGroup.create({ data: { seasonId: season.id, sessionId: session.id, title: "Подгруппа" } });
  await db.assessmentMember.create({ data: { applicationId: app.id, groupId: group.id } });
  await db.assessmentInvite.create({ data: { applicationId: app.id, sessionId: session.id, attended: true } });
  async function slot(at: string) { return db.interviewSlot.create({ data: { seasonId: season.id, startsAt: new Date(at), endsAt: new Date(+new Date(at) + 45 * 60_000), location: "Корпус", interviewers: { create: { userId: master.id } } } }); }
  const row = { date: "2026-11-02", from: "08:30", to: "10:10", interviewerId: master.id, location: "Корпус" };
  return { season, master, user, app, slot, row };
}

describe("перерывы и безопасный пересчёт", () => {
  it("сохраняет начавшуюся встречу и проверяет перерыв перед будущей", async () => {
    const f = await setup();
    const started = await f.slot("2026-11-02T08:30:00+03:00");
    const future = await f.slot("2026-11-02T09:15:00+03:00");
    const booking = await db.interviewBooking.create({ data: { applicationId: f.app.id, slotId: started.id } });
    const at = new Date("2026-11-02T09:00:00+03:00");
    const params = { seasonId: f.season.id, actorId: f.master.id, rows: [{ ...f.row, from: "09:20", to: "10:05" }], preview: true };
    expect(await reflowSchedule({ ...params, rows: [{ ...f.row, from: "09:19", to: "10:04" }] }, at)).toMatchObject({ ok: false });
    const preview = await reflowSchedule(params, at);
    expect(preview).toMatchObject({ ok: true, total: 1, archived: 1, moved: 0 });
    expect(await reflowSchedule({ ...params, preview: false, version: "version" in preview ? preview.version : "" }, at)).toMatchObject({ ok: true });
    expect((await db.interviewSlot.findUniqueOrThrow({ where: { id: started.id } })).archivedAt).toBeNull();
    expect((await db.interviewBooking.findUniqueOrThrow({ where: { id: booking.id } })).cancelledAt).toBeNull();
    expect((await db.interviewSlot.findUniqueOrThrow({ where: { id: future.id } })).archivedAt).not.toBeNull();
  });
  it("08:30–13:20 вмещает пять встреч; соседние окна объединяются, обед сохраняется", () => {
    const row = { date: "2026-11-02", from: "08:30", to: "10:00", location: "К", interviewerId: "m" };
    const result = availabilitySlots([row, { ...row, from: "10:10", to: "11:40" }, { ...row, from: "11:50", to: "13:20" }, { ...row, from: "14:00", to: "15:30" }]);
    expect(result).toHaveLength(6);
    expect(result[4]!.endsAt.toISOString()).toBe("2026-11-02T09:35:00.000Z");
    expect(result[5]!.startsAt.toISOString()).toBe("2026-11-02T11:00:00.000Z");
    expect(cutSlots({ ...row, duration: 45, gap: 0 })).toHaveLength(1);
    expect(matchBookings([0, 1], [0])).toBeNull();
    expect(matchBookings([0, 99], [0, 50, 100])).toEqual([0, 2]);
  });
  it("переносит запись на 5 минут, сохраняет историю и попытку, уведомляет обе стороны", async () => {
    const f = await setup();
    await f.slot("2026-11-02T08:30:00+03:00");
    const old = await f.slot("2026-11-02T09:15:00+03:00");
    const booking = await db.interviewBooking.create({ data: { applicationId: f.app.id, slotId: old.id } });
    const params = { seasonId: f.season.id, actorId: f.master.id, rows: [f.row], preview: true };
    const preview = await reflowSchedule(params, now);
    expect(preview).toMatchObject({ ok: true, total: 2, moved: 1, maxShiftMinutes: 5 });
    expect(await db.notification.count()).toBe(0);
    const result = await reflowSchedule({ ...params, preview: false, version: "version" in preview ? preview.version : "" }, now);
    expect(result).toMatchObject({ ok: true, moved: 1 });
    const active = await db.interviewBooking.findFirstOrThrow({ where: { applicationId: f.app.id, cancelledAt: null }, include: { slot: true } });
    expect(active.slot.startsAt.toISOString()).toBe("2026-11-02T06:20:00.000Z");
    expect((await db.interviewBooking.findUniqueOrThrow({ where: { id: booking.id } })).cancelledAt).not.toBeNull();
    expect((await db.application.findUniqueOrThrow({ where: { id: f.app.id } })).interviewReschedulesUsed).toBe(0);
    expect(await db.notification.count({ where: { key: `interview-reflow:${booking.id}` } })).toBe(2);
    expect(await interviewReminderIsCurrent(`booking:${booking.id}:24h`, now)).toBe(false);
    expect(await restoreSlot(f.master.id, f.season.id, old.id, now)).toMatchObject({ ok: false });
    expect(await book(f.user.id, old.id, now)).toMatchObject({ ok: false });
  });
  it("новая запись после предпросмотра отменяет сохранение; недостаток мест ничего не меняет", async () => {
    const f = await setup();
    const first = await f.slot("2026-11-02T08:30:00+03:00");
    const params = { seasonId: f.season.id, actorId: f.master.id, rows: [f.row], preview: true };
    const preview = await reflowSchedule(params, now);
    await db.interviewBooking.create({ data: { applicationId: f.app.id, slotId: first.id } });
    expect(await reflowSchedule({ ...params, preview: false, version: "version" in preview ? preview.version : "" }, now)).toMatchObject({ ok: false });
    expect(await db.interviewSlot.count({ where: { archivedAt: { not: null } } })).toBe(0);
  });
  it("перерыв проверяется по соседнему слоту; сведения мастера не выдаются кандидату", async () => {
    const f = await setup(); const first = await f.slot("2026-11-03T08:30:00+03:00");
    await expect(db.$transaction(tx => checkOverlap(tx, f.master.id, new Date("2026-11-03T09:19:00+03:00"), new Date("2026-11-03T10:04:00+03:00")))).rejects.toThrow(/5 минут/);
    await expect(db.$transaction(tx => checkOverlap(tx, f.master.id, new Date("2026-11-03T09:20:00+03:00"), new Date("2026-11-03T10:05:00+03:00")))).resolves.toBeUndefined();
    expect(JSON.stringify(await loadInterview(f.user.id, now))).not.toContain("СкрытоеИмяМастера");
    expect(await book(f.user.id, first.id, now)).toMatchObject({ ok: true });
    const dto = await loadInterview(f.user.id, now);
    expect(dto?.booking).not.toHaveProperty("interviewers");
    expect(JSON.stringify(dto)).not.toContain(f.master.id);
    const note = await db.notification.findFirstOrThrow({ where: { userId: f.master.id, title: "Новая запись на собеседование" }, include: { deliveries: true } });
    expect(note.body).toContain("Корпус"); expect(note.body).toContain("08:30");
    expect(note.deliveries[0]?.scheduledAt).toEqual(now);
  });
  it("если записей больше нового числа мест, ничего не отменяется", async () => {
    const f = await setup();
    const first = await f.slot("2026-11-02T08:30:00+03:00"), second = await f.slot("2026-11-02T09:15:00+03:00");
    const user = await db.user.create({ data: {} });
    const another = await db.application.create({ data: { userId: user.id, seasonId: f.season.id, status: "SUBMITTED" } });
    await db.interviewBooking.createMany({ data: [{ slotId: first.id, applicationId: f.app.id }, { slotId: second.id, applicationId: another.id }] });
    expect(await reflowSchedule({ seasonId: f.season.id, actorId: f.master.id, rows: [{ ...f.row, to: "10:00" }], preview: true }, now)).toMatchObject({ ok: false });
    expect(await db.interviewBooking.count({ where: { cancelledAt: null } })).toBe(2);
    expect(await db.interviewSlot.count({ where: { archivedAt: { not: null } } })).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });
  it("приглашение резерву создаётся в 08:00, один раз, записавшимся повтор не приходит", async () => {
    const f = await setup();
    expect((await previewReserveInvitations(f.season.id)).people).toHaveLength(1);
    const at = new Date("2026-11-02T08:00:00+03:00");
    expect(await scheduleReserveInvitations(f.season.id, f.master.id, at, now)).toMatchObject({ ok: true, count: 1 });
    await materializeReserveInvitations(new Date(+at - 1)); expect(await db.notification.count()).toBe(0);
    await materializeReserveInvitations(at); await materializeReserveInvitations(new Date(+at + 5000));
    expect(await db.notification.count({ where: { userId: f.user.id, key: `interview-invite:${f.season.id}` } })).toBe(1);
    expect((await previewReserveInvitations(f.season.id)).scheduled?.status).toBe("DONE");
  });
  it("утренняя проверка исключает уже записавшегося участника", async () => {
    const f = await setup();
    const at = new Date("2026-11-02T08:00:00+03:00");
    await scheduleReserveInvitations(f.season.id, f.master.id, at, now);
    const slot = await f.slot("2026-11-03T08:30:00+03:00");
    await db.interviewBooking.create({ data: { applicationId: f.app.id, slotId: slot.id } });
    await materializeReserveInvitations(at);
    expect(await db.notification.count({ where: { key: `interview-invite:${f.season.id}` } })).toBe(0);
    expect((await previewReserveInvitations(f.season.id)).scheduled?.status).toBe("DONE");
  });
});
