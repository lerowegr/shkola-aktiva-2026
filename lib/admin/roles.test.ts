import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import type { Actor } from "~~/lib/permissions";
import { resetDatabase } from "~~/lib/test/db";

import { deleteRole, listRoles, saveRole } from "./roles";

const lead: Actor = { isOwner: false, isActive: true, permissions: ["roles.manage", "applications.review", "messages.reply"] };
const owner: Actor = { isOwner: true, isActive: true, permissions: [] };

beforeEach(resetDatabase);

describe("роли", () => {
  it("создаёт роль, выкидывая неизвестные права", async () => {
    const result = await saveRole(lead, { name: "Мастер", description: null, color: null, permissions: ["applications.review", "nope"] });
    expect(result.ok).toBe(true);
    const role = await db.role.findFirstOrThrow();
    expect(role.permissions).toEqual(["applications.review"]);
    expect(role.slug).toBeTruthy();
  });

  it("нельзя выдать роли право, которого нет у себя", async () => {
    const result = await saveRole(lead, { name: "Сильная", description: null, color: null, permissions: ["users.manage"] });
    expect(result.ok).toBe(false);
  });

  it("нельзя править роль сильнее себя, даже урезая", async () => {
    const admin = await db.role.create({ data: { name: "Админ", slug: "admin", permissions: ["users.manage", "roles.manage"] } });
    const result = await saveRole(lead, { id: admin.id, name: "Админ", description: null, color: null, permissions: ["roles.manage"] });
    expect(result.ok).toBe(false);
  });

  it("одинаковое название — понятный отказ", async () => {
    await saveRole(owner, { name: "Мастер", description: null, color: null, permissions: [] });
    expect(await saveRole(owner, { name: "Мастер", description: null, color: null, permissions: [] })).toMatchObject({ ok: false });
  });

  it("системную и роль с людьми не удалить, пустую — можно", async () => {
    const system = await db.role.create({ data: { name: "Сист", slug: "s", permissions: [], isSystem: true } });
    const used = await db.role.create({ data: { name: "Занята", slug: "u", permissions: [] } });
    await db.user.create({ data: { roles: { create: { roleId: used.id } } } });
    const empty = await db.role.create({ data: { name: "Пустая", slug: "e", permissions: [] } });

    expect(await deleteRole(owner, system.id)).toMatchObject({ ok: false });
    expect(await deleteRole(owner, used.id)).toMatchObject({ ok: false });
    expect(await deleteRole(owner, empty.id)).toEqual({ ok: true });
    expect((await listRoles()).map((role) => role.name).sort()).toEqual(["Занята", "Сист"]);
  });
});
