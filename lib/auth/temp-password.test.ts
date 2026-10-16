import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { issueTempPassword, tempPasswordMatches } from "./temp-password";

describe("временный пароль", () => {
  beforeEach(resetDatabase);

  it("нет аккаунта или данных для входа — объясняем, а не выдаём", async () => {
    expect(await issueTempPassword("1")).toEqual({ ok: false, reason: "no_account" });
    await db.user.create({ data: { telegramId: "2" } });
    expect(await issueTempPassword("2")).toEqual({ ok: false, reason: "no_credentials" });
  });

  it("выдаётся на 24 часа и подходит только до срока", async () => {
    await db.user.create({ data: { telegramId: "3", login: "anna" } });
    const now = new Date("2026-10-16T10:00:00Z");
    const issued = await issueTempPassword("3", now);
    expect(issued).toMatchObject({ ok: true, signIn: "anna", staff: false });
    if (!issued.ok) return;
    const user = await db.user.findUniqueOrThrow({ where: { telegramId: "3" } });
    expect(user.tempPasswordHash).not.toContain(issued.password);
    expect(await tempPasswordMatches(user, issued.password, new Date("2026-10-17T09:59:00Z"))).toBe(true);
    expect(await tempPasswordMatches(user, issued.password, new Date("2026-10-17T10:01:00Z"))).toBe(false);
    expect(await tempPasswordMatches(user, "чужой", now)).toBe(false);
  });
});
