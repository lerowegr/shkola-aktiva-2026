import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~~/lib/db";
import * as audit from "~~/lib/audit";
import { resetDatabase } from "~~/lib/test/db";
import { importSchedule } from "./import-schedule";
import { parseInterviewTable, validInterval } from "./import-table";

const now = new Date("2026-11-01T12:00:00+03:00");
beforeEach(resetDatabase);

describe("загрузка расписания", () => {
  async function setup() {
    const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026 } });
    const actor = await db.user.create({ data: { isOwner: true } });
    const row = { date: "2026-11-02", from: "14:00", to: "15:35", location: "Верхняя Масловка 15", interviewerId: actor.id };
    return { season, actor, row, params: { seasonId: season.id, actorId: actor.id, rows: [row], preview: false } };
  }
  it("предпросмотр не пишет, повтор не дублирует, аудит атомарен", async () => {
    const { params } = await setup();
    expect(await importSchedule({ ...params, preview: true }, now)).toMatchObject({ ok: true, created: 2 });
    expect(await db.interviewSlot.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
    expect(await importSchedule(params, now)).toMatchObject({ ok: true, created: 2 });
    expect(await importSchedule(params, now)).toMatchObject({ ok: true, created: 0, unchanged: 2 });
    const slots = await db.interviewSlot.findMany({ include: { interviewers: true } });
    expect(slots).toHaveLength(2);
    expect(slots.every(s => +s.endsAt - +s.startsAt === 45 * 60_000 && s.capacity === 1 && s.interviewers.length === 1)).toBe(true);
    expect(await db.auditLog.count({ where: { action: "interview.schedule_import" } })).toBe(2);
  });
  it("свободные старые слоты переиспользуются; лишние не удаляются", async () => {
    const { params, row } = await setup();
    await importSchedule(params, now);
    const ids = (await db.interviewSlot.findMany()).map(s => s.id).sort();
    expect(await importSchedule({ ...params, rows: [{ ...row, from: "15:40", to: "17:15" }] }, now)).toMatchObject({ ok: true, updated: 2, created: 0 });
    expect((await db.interviewSlot.findMany()).map(s => s.id).sort()).toEqual(ids);
    expect(await importSchedule({ ...params, rows: [{ ...row, to: "14:45" }] }, now)).toMatchObject({ ok: false });
    expect(await db.interviewSlot.count()).toBe(2);
  });
  it("ошибка строки, пересечение и посторонний мастер не оставляют частичное расписание", async () => {
    const { params, row } = await setup();
    const stranger = await db.user.create({ data: {} });
    for (const invalid of [{ ...row, date: "2026-02-30" }, { ...row, from: "25:00" }, { ...row, interviewerId: stranger.id }, { ...row, from: "14:30", to: "16:00" }]) {
      expect(await importSchedule({ ...params, rows: [row, invalid] }, now)).toMatchObject({ ok: false });
      expect(await db.interviewSlot.count()).toBe(0);
    }
    expect(await importSchedule({ ...params, actorId: stranger.id }, now)).toMatchObject({ ok: false });
  });
  it("занятый слот остаётся на месте, конкурентный повтор создаёт единственный набор", async () => {
    const { params, row, season } = await setup();
    await Promise.all([importSchedule(params, now), importSchedule(params, now)]);
    expect(await db.interviewSlot.count()).toBe(2);
    const slot = await db.interviewSlot.findFirstOrThrow();
    const candidate = await db.user.create({ data: {} });
    const app = await db.application.create({ data: { userId: candidate.id, seasonId: season.id } });
    await db.interviewBooking.create({ data: { slotId: slot.id, applicationId: app.id } });
    expect(await importSchedule({ ...params, rows: [{ ...row, from: "15:40", to: "17:15" }] }, now)).toMatchObject({ ok: false });
    expect((await db.interviewSlot.findUniqueOrThrow({ where: { id: slot.id } })).startsAt).toEqual(slot.startsAt);
  });
  it("сбой журнала откатывает все слоты", async () => {
    const { params } = await setup();
    const spy = vi.spyOn(audit, "writeAudit").mockRejectedValueOnce(new Error("audit unavailable"));
    try { await expect(importSchedule(params, now)).rejects.toThrow("audit unavailable"); }
    finally { spy.mockRestore(); }
    expect(await db.interviewSlot.count()).toBe(0);
  });
  it("таблица сверяет действительное имя, ё/е, даты и длину интервала", () => {
    const people = [{ id: "1", name: "Мария Новосёлова" }];
    expect(parseInterviewTable("Дата\tС\tДо\tКорпус\tМастер\n2026-11-02\t08:30\t10:00\tЛенка\tМария Новоселова", people)).toMatchObject({ errors: [], rows: [{ interviewerId: "1" }] });
    expect(parseInterviewTable("2026-11-02\t08:30\t09:00\tЛенка\tМария Новосёлова", people).errors).toHaveLength(1);
    expect(parseInterviewTable("2026-11-02\t08:30\t10:00\tЛенка\tМаша", people).errors).toHaveLength(1);
    expect(validInterval({ date: "2026-02-30", from: "08:30", to: "10:00" })).toBe(false);
  });
});
