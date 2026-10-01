import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { loadUser } from "./actor";

beforeEach(resetDatabase);

async function role(slug: string, permissions: string[]) {
  return db.role.create({ data: { name: slug, slug, permissions } });
}

describe("loadUser", () => {
  it("кандидат без ролей — не организатор", async () => {
    const user = await db.user.create({ data: { firstName: "Алина" } });
    const loaded = await loadUser(user.id);

    expect(loaded?.permissions).toEqual([]);
    expect(loaded?.isStaff).toBe(false);
    expect(loaded?.name).toBe("Алина");
  });

  it("права собираются из всех ролей без дублей", async () => {
    const master = await role("master", ["applications.review", "messages.reply"]);
    const lead = await role("lead", ["applications.review", "stages.manage"]);
    const user = await db.user.create({
      data: {
        firstName: "Екатерина",
        lastName: "Орлова",
        roles: { create: [{ roleId: master.id }, { roleId: lead.id }] },
      },
    });

    const loaded = await loadUser(user.id);

    expect([...(loaded?.permissions ?? [])].sort()).toEqual([
      "applications.review",
      "messages.reply",
      "stages.manage",
    ]);
    expect(loaded?.isStaff).toBe(true);
    expect(loaded?.name).toBe("Екатерина Орлова");
  });

  it("владелец — организатор даже без ролей", async () => {
    const user = await db.user.create({ data: { isOwner: true, email: "a@b.ru" } });
    expect((await loadUser(user.id))?.isStaff).toBe(true);
  });

  it("незнакомый id — null", async () => {
    expect(await loadUser("нет-такого")).toBeNull();
    expect(await loadUser(null)).toBeNull();
  });
});
