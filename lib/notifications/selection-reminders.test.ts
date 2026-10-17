import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { materializeApplicationDeadline, materializeAssessmentReminders } from "./selection-reminders";

const NOW = new Date("2026-11-14T12:00:00Z");
const TOMORROW = new Date("2026-11-15T12:00:00Z");
let seasonId: string;
let stageId: string;

beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  stageId = (await db.stage.create({ data: {
    seasonId, kind: "APPLICATION", title: "Анкета", order: 1,
    opensAt: new Date("2026-11-01T00:00:00Z"), closesAt: TOMORROW,
  } })).id;
});

describe("суточное напоминание об анкете и ДЗ", () => {
  it("напоминает черновику и не начавшему, один раз, с датой по Москве", async () => {
    const draft = await db.user.create({ data: {} });
    await db.application.create({ data: { userId: draft.id, seasonId } });
    await db.user.create({ data: {} });
    expect(await materializeApplicationDeadline(new Date(NOW.getTime() - 1))).toBe(0);
    expect(await materializeApplicationDeadline(NOW)).toBe(2);
    expect(await materializeApplicationDeadline(NOW)).toBe(0);
    const notification = await db.notification.findFirstOrThrow({ where: { userId: draft.id } });
    expect(notification.body).toContain("15 ноября в 15:00 по Москве");
    expect(notification.body).toContain("домашнее задание");
    expect(notification.url).toBe("/cabinet/application");
  });

  it("исключает отправивших, заблокированных, владельца и организаторов", async () => {
    const submitted = await db.user.create({ data: {} });
    await db.application.create({ data: { userId: submitted.id, seasonId, status: "SUBMITTED" } });
    await db.user.create({ data: { isOwner: true } });
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: [] } });
    await db.user.create({ data: { roles: { create: { roleId: role.id } } } });
    const blocked = await db.user.create({ data: {} });
    await db.user.update({ where: { id: blocked.id }, data: { status: "BLOCKED" } });
    expect(await materializeApplicationDeadline(NOW)).toBe(0);
  });

  it("не напоминает после срока, при закрытии, без даты и в старом сезоне", async () => {
    await db.user.create({ data: {} });
    expect(await materializeApplicationDeadline(TOMORROW)).toBe(0);
    await db.stage.update({ where: { id: stageId }, data: { mode: "CLOSED" } });
    expect(await materializeApplicationDeadline(NOW)).toBe(0);
    await db.stage.update({ where: { id: stageId }, data: { mode: "OPEN", closesAt: null } });
    expect(await materializeApplicationDeadline(NOW)).toBe(0);
    await db.stage.update({ where: { id: stageId }, data: { closesAt: TOMORROW } });
    await db.season.update({ where: { id: seasonId }, data: { isCurrent: false } });
    expect(await materializeApplicationDeadline(NOW)).toBe(0);
  });

  it("после переноса дедлайна создаёт новое напоминание на новую дату", async () => {
    await db.user.create({ data: {} });
    expect(await materializeApplicationDeadline(NOW)).toBe(1);
    await db.stage.update({ where: { id: stageId }, data: { closesAt: new Date(TOMORROW.getTime() + 86400000) } });
    expect(await materializeApplicationDeadline(NOW)).toBe(0);
    expect(await materializeApplicationDeadline(TOMORROW)).toBe(1);
  });

  it("ставит Telegram в очередь и соблюдает ночной режим", async () => {
    const user = await db.user.create({ data: { telegramId: "12345678" } });
    const night = new Date("2026-11-14T22:00:00Z");
    expect(await materializeApplicationDeadline(night)).toBe(1);
    const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { userId: user.id, channel: "TELEGRAM" } });
    expect(delivery.status).toBe("PENDING");
    expect(delivery.scheduledAt.toISOString()).toBe("2026-11-15T05:00:00.000Z");
  });
});

describe("суточное напоминание о ЦО", () => {
  async function group() {
    const user = await db.user.create({ data: {} });
    const application = await db.application.create({ data: { userId: user.id, seasonId, status: "SUBMITTED" } });
    return db.assessmentGroup.create({ data: {
      seasonId, title: "Группа", startsAt: new Date("2026-12-01T00:00:00Z"), room: "Скрытая",
      notifiedAt: NOW, notified: { building: "2", room: "305", startsAt: TOMORROW.toISOString(), note: "Возьми студенческий" },
      members: { create: { applicationId: application.id } },
    } });
  }

  it("использует только опубликованное назначение, без дублей", async () => {
    await group();
    expect(await materializeAssessmentReminders(new Date(NOW.getTime() - 1))).toBe(0);
    expect(await materializeAssessmentReminders(NOW)).toBe(1);
    expect(await materializeAssessmentReminders(NOW)).toBe(0);
    const notification = await db.notification.findFirstOrThrow();
    expect(notification.body).toContain("15 ноября в 15:00 по Москве");
    expect(notification.body).toContain("аудитория 305");
    expect(notification.body).toContain("Возьми студенческий");
    expect(notification.body).not.toContain("Скрытая");
    expect(notification.url).toBe("/cabinet");
  });

  it("исключает прошедшее, неопубликованное и некорректное время", async () => {
    const g = await group();
    expect(await materializeAssessmentReminders(TOMORROW)).toBe(0);
    await db.assessmentGroup.update({ where: { id: g.id }, data: { notifiedAt: null } });
    expect(await materializeAssessmentReminders(NOW)).toBe(0);
    await db.assessmentGroup.update({ where: { id: g.id }, data: { notifiedAt: NOW, notified: { startsAt: "ошибка" } } });
    expect(await materializeAssessmentReminders(NOW)).toBe(0);
  });

  it("после опубликованного переноса напоминает о новой дате", async () => {
    const g = await group();
    expect(await materializeAssessmentReminders(NOW)).toBe(1);
    await db.assessmentGroup.update({ where: { id: g.id }, data: { notified: {
      startsAt: new Date(TOMORROW.getTime() + 86400000).toISOString(), room: "306",
    } } });
    expect(await materializeAssessmentReminders(NOW)).toBe(0);
    expect(await materializeAssessmentReminders(TOMORROW)).toBe(1);
  });

  it("не напоминает черновику, заблокированному и участнику старого сезона", async () => {
    const g = await group();
    const member = await db.assessmentMember.findFirstOrThrow({ where: { groupId: g.id } });
    const application = await db.application.update({ where: { id: member.applicationId }, data: { status: "DRAFT" } });
    expect(await materializeAssessmentReminders(NOW)).toBe(0);
    await db.application.update({ where: { id: application.id }, data: { status: "SUBMITTED" } });
    await db.user.update({ where: { id: application.userId }, data: { status: "BLOCKED" } });
    expect(await materializeAssessmentReminders(NOW)).toBe(0);
    await db.user.update({ where: { id: application.userId }, data: { status: "ACTIVE" } });
    await db.season.update({ where: { id: seasonId }, data: { isCurrent: false } });
    expect(await materializeAssessmentReminders(NOW)).toBe(0);
  });
});
