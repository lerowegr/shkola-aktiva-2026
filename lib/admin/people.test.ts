import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { grantRole, revokeRole, searchPeople, setBlocked } from "./people";

beforeEach(resetDatabase);

const lead = (id: string) => ({ id, isOwner: false, isActive: true, permissions: ["users.manage", "applications.review"] });

describe("люди", () => {
  it("поиск по имени, почте и нику; «команда» — только с ролями", async () => {
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: [] } });
    await db.user.create({ data: { firstName: "Екатерина", lastName: "Орлова", email: "orlova@mail.ru", roles: { create: { roleId: role.id } } } });
    await db.user.create({ data: { firstName: "Алина", telegramUsername: "alina_sm" } });

    expect((await searchPeople({ query: "орл", scope: "all" })).map((p) => p.name)).toEqual(["Екатерина Орлова"]);
    expect((await searchPeople({ query: "@alina", scope: "all" })).map((p) => p.name)).toEqual(["Алина"]);
    expect((await searchPeople({ query: "", scope: "staff" })).map((p) => p.name)).toEqual(["Екатерина Орлова"]);
  });

  it("выдать и снять можно только роль не сильнее себя", async () => {
    const actor = await db.user.create({ data: {} });
    const user = await db.user.create({ data: {} });
    const master = await db.role.create({ data: { name: "Мастер", slug: "m", permissions: ["applications.review"] } });
    const admin = await db.role.create({ data: { name: "Админ", slug: "a", permissions: ["roles.manage"] } });

    expect(await grantRole(lead(actor.id), user.id, master.id)).toEqual({ ok: true });
    expect(await grantRole(lead(actor.id), user.id, admin.id)).toMatchObject({ ok: false });

    await db.userRole.create({ data: { userId: user.id, roleId: admin.id } });
    expect(await revokeRole(lead(actor.id), user.id, admin.id)).toMatchObject({ ok: false });
    expect(await revokeRole(lead(actor.id), user.id, master.id)).toEqual({ ok: true });
  });

  it("блокировка обрывает сессии; владельца и себя не заблокировать", async () => {
    const actor = await db.user.create({ data: {} });
    const owner = await db.user.create({ data: { isOwner: true } });
    const user = await db.user.create({ data: {} });
    await db.session.create({ data: { sessionToken: "t", userId: user.id, expires: new Date(Date.now() + 1e7) } });

    expect(await setBlocked(actor, user.id, true)).toEqual({ ok: true });
    expect(await db.session.count()).toBe(0);
    expect(await setBlocked(actor, owner.id, true)).toMatchObject({ ok: false });
    expect(await setBlocked(actor, actor.id, true)).toMatchObject({ ok: false });
    expect(await setBlocked(actor, user.id, false)).toEqual({ ok: true });
  });
});
