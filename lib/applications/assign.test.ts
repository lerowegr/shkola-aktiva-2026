import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { assignApplication, assignUnassigned, pickReviewer, reassignApplication } from "./assign";

describe("pickReviewer", () => {
  it("пустой пул — некому", () => {
    expect(pickReviewer([])).toBeNull();
  });

  it("меньше нагрузка — раньше", () => {
    expect(pickReviewer([{ id: "b", load: 3 }, { id: "a", load: 1 }, { id: "c", load: 2 }])).toBe("a");
  });

  it("при равной нагрузке — по id, одинаково при любом порядке", () => {
    expect(pickReviewer([{ id: "b", load: 1 }, { id: "a", load: 1 }])).toBe("a");
    expect(pickReviewer([{ id: "a", load: 1 }, { id: "b", load: 1 }])).toBe("a");
  });
});

describe("назначение на базе", () => {
  let seasonId: string;
  let masterRoleId: string;

  beforeEach(async () => {
    await resetDatabase();
    const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
    seasonId = season.id;
    const role = await db.role.create({
      data: { name: "Мастер", slug: "master", permissions: ["applications.review"] },
    });
    masterRoleId = role.id;
  });

  async function master(name: string) {
    return db.user.create({ data: { firstName: name, roles: { create: { roleId: masterRoleId } } } });
  }

  async function application(name: string) {
    const user = await db.user.create({ data: { firstName: name } });
    return db.application.create({
      data: { seasonId, userId: user.id, status: "SUBMITTED", submittedAt: new Date() },
    });
  }

  it("две анкеты на двух мастеров расходятся по одной", async () => {
    const [first, second] = [await master("Катя"), await master("Илья")];
    const a = await application("А");
    const b = await application("Б");

    const ra = await assignApplication(a.id, "APPLICATION", null);
    const rb = await assignApplication(b.id, "APPLICATION", null);

    expect(new Set([ra?.reviewerId, rb?.reviewerId])).toEqual(new Set([first.id, second.id]));
  });

  it("повторный вызов не создаёт второе назначение", async () => {
    await master("Катя");
    await master("Илья");
    const a = await application("А");

    const first = await assignApplication(a.id, "APPLICATION", null);
    const again = await assignApplication(a.id, "APPLICATION", null);

    expect(again?.id).toBe(first?.id);
    expect(await db.review.count()).toBe(1);
  });

  it("заблокированный мастер и человек без права в пул не попадают", async () => {
    const blocked = await master("Бывший");
    await db.user.update({ where: { id: blocked.id }, data: { status: "BLOCKED" } });
    await db.user.create({ data: { firstName: "Кандидат" } });
    const a = await application("А");

    expect(await assignApplication(a.id, "APPLICATION", null)).toBeNull();
  });

  it("одновременные отправки распределяются ровно", async () => {
    await master("Катя");
    await master("Илья");
    const apps = await Promise.all(["А", "Б", "В", "Г"].map(application));

    await Promise.all(apps.map((app) => assignApplication(app.id, "APPLICATION", null)));

    const loads = await db.review.groupBy({ by: ["reviewerId"], _count: true });
    expect(loads.map((row) => row._count).sort()).toEqual([2, 2]);
  });

  it("распределить нераспределённые — только тех, у кого нет мастера", async () => {
    await master("Катя");
    const a = await application("А");
    await application("Б");
    await assignApplication(a.id, "APPLICATION", null);

    expect(await assignUnassigned(seasonId, "APPLICATION", null)).toHaveLength(1);
    expect(await db.review.count()).toBe(2);
  });

  it("переназначение передаёт оценку вместе с баллами", async () => {
    const katya = await master("Катя");
    const ilya = await master("Илья");
    const a = await application("А");
    await db.review.create({ data: { applicationId: a.id, stageKind: "APPLICATION", reviewerId: katya.id } });

    const moved = await reassignApplication(a.id, "APPLICATION", ilya.id);

    expect(moved?.reviewerId).toBe(ilya.id);
    expect(await db.review.count()).toBe(1);
  });
});
