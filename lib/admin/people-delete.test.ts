import { beforeEach, describe, expect, it } from "vitest";

import { loadUser } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteCheck, deleteOrganizer } from "./people";

describe("удаление организатора", () => {
  let admin: NonNullable<Awaited<ReturnType<typeof loadUser>>>;
  let masterRole: string;
  let seasonId: string;
  let criterionId: string;

  beforeEach(async () => {
    await resetDatabase();
    const all = await db.role.create({ data: { name: "Тех.админ", slug: "admin", permissions: ["users.manage", "roles.manage", "applications.review"] } });
    masterRole = (await db.role.create({ data: { name: "Мастер", slug: "master", permissions: ["applications.review"] } })).id;
    const adminUser = await db.user.create({ data: { firstName: "Адм", roles: { create: { roleId: all.id } } } });
    admin = (await loadUser(adminUser.id))!;
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    criterionId = (await db.criterion.create({ data: { seasonId, stageKind: "APPLICATION", order: 1, title: "К", maxScore: 2, levels: [] } })).id;
  });

  const master = (name: string) => db.user.create({ data: { firstName: name, roles: { create: { roleId: masterRole } } } });
  async function application() {
    const user = await db.user.create({ data: {} });
    return db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED" } });
  }

  it("без работы — удаляется, пустые назначения снимаются", async () => {
    const kate = await master("Катя");
    const app = await application();
    await db.review.create({ data: { applicationId: app.id, stageKind: "APPLICATION", reviewerId: kate.id } });
    expect(await deleteCheck(kate.id)).toMatchObject({ scored: 0, assigned: 1 });
    expect(await deleteOrganizer(admin, kate.id, null)).toMatchObject({ ok: true });
    expect(await db.user.count({ where: { id: kate.id } })).toBe(0);
  });

  it("с баллами — без преемника нельзя, с преемником баллы переезжают", async () => {
    const kate = await master("Катя");
    const ilya = await master("Илья");
    const app = await application();
    const review = await db.review.create({ data: { applicationId: app.id, stageKind: "APPLICATION", reviewerId: kate.id } });
    await db.reviewScore.create({ data: { reviewId: review.id, criterionId, score: 2 } });

    expect(await deleteOrganizer(admin, kate.id, null)).toMatchObject({ ok: false });
    expect(await deleteOrganizer(admin, kate.id, ilya.id)).toMatchObject({ ok: true, moved: 1 });
    const moved = await db.review.findUniqueOrThrow({ where: { id: review.id }, include: { scores: true } });
    expect(moved.reviewerId).toBe(ilya.id);
    expect(moved.scores[0]!.score).toBe(2);
  });

  it("у преемника своя оценка того же кандидата — отказ, ничего не трогаем", async () => {
    const kate = await master("Катя");
    const ilya = await master("Илья");
    const app = await application();
    await db.review.create({ data: { applicationId: app.id, stageKind: "APPLICATION", reviewerId: kate.id, comment: "хорошо" } });
    await db.review.create({ data: { applicationId: app.id, stageKind: "APPLICATION", reviewerId: ilya.id } });
    expect(await deleteOrganizer(admin, kate.id, ilya.id)).toMatchObject({ ok: false });
    expect(await db.user.count({ where: { id: kate.id } })).toBe(1);
  });

  it("себя, владельца и кандидата — нельзя", async () => {
    const owner = await db.user.create({ data: { isOwner: true, roles: { create: { roleId: masterRole } } } });
    const candidate = await db.user.create({ data: {} });
    expect(await deleteOrganizer(admin, admin.id, null)).toMatchObject({ ok: false });
    expect(await deleteOrganizer(admin, owner.id, null)).toMatchObject({ ok: false });
    expect(await deleteOrganizer(admin, candidate.id, null)).toMatchObject({ ok: false });
  });
});
