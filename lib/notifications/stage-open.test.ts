import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { materializeStageOpen } from "./stage-open";

const OPENS = new Date("2026-11-01T09:00:00Z");
let seasonId: string;
let stageId: string;

beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  stageId = (
    await db.stage.create({
      data: { seasonId, kind: "APPLICATION", title: "Анкета", order: 1, opensAt: OPENS, closesAt: new Date("2026-11-15T20:59:00Z") },
    })
  ).id;
});

const early = new Date("2026-10-20T10:00:00Z");
const after = new Date("2026-11-01T09:01:00Z");

describe("уведомление «анкета открылась»", () => {
  it("до открытия не шлёт", async () => {
    await db.user.create({ data: { createdAt: early } });
    expect(await materializeStageOpen(new Date("2026-10-31T09:00:00Z"))).toBe(0);
  });

  it("после открытия — пришедшим заранее, один раз, с дедлайном по Москве", async () => {
    const user = await db.user.create({ data: { createdAt: early } });
    expect(await materializeStageOpen(after)).toBe(1);
    expect(await materializeStageOpen(after)).toBe(0);

    const notification = await db.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(notification.key).toBe(`stage-open:${stageId}`);
    expect(notification.body).toBe("Заполнить и отправить можно до 15 ноября в 23:59 по Москве.");
  });

  it("не шлёт тем, кто уже начал анкету, организаторам и пришедшим после открытия", async () => {
    const started = await db.user.create({ data: { createdAt: early } });
    await db.application.create({ data: { seasonId, userId: started.id } });
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: [] } });
    await db.user.create({ data: { createdAt: early, roles: { create: { roleId: role.id } } } });
    await db.user.create({ data: { createdAt: early, isOwner: true } });
    await db.user.create({ data: { createdAt: new Date("2026-11-01T09:00:30Z") } });

    expect(await materializeStageOpen(after)).toBe(0);
  });

  it("открыли вручную раньше даты — считаем от момента переключения", async () => {
    await db.user.create({ data: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    await db.stage.update({ where: { id: stageId }, data: { mode: "OPEN" } });
    expect(await materializeStageOpen(new Date())).toBe(1);
  });
});
