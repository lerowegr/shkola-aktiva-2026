import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { acceptInvite, checkInvite, createInvite, INVITE_TTL_DAYS } from "./invite";
import { verifyPassword } from "./password";

beforeEach(async () => {
  await resetDatabase();
  vi.useRealTimers();
});

async function organizer() {
  return db.user.create({ data: { email: "orlova@mail.ru", firstName: "Екатерина" } });
}

describe("приглашения", () => {
  it("свежее приглашение действует, в базе лежит не токен, а хеш", async () => {
    const user = await organizer();
    const { token } = await createInvite(user.id, null);

    expect(await checkInvite(token)).toMatchObject({ ok: true, userId: user.id });
    const row = await db.staffInvite.findFirstOrThrow();
    expect(row.tokenHash).not.toBe(token);
  });

  it("принятие задаёт пароль и гасит приглашение", async () => {
    const user = await organizer();
    const { token } = await createInvite(user.id, null);

    expect(await acceptInvite(token, "кораблик в тумане")).toEqual({ ok: true, userId: user.id });

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("кораблик в тумане", row.passwordHash)).toBe(true);
    expect(await checkInvite(token)).toEqual({ ok: false, reason: "used" });
    expect(await acceptInvite(token, "другой пароль тут")).toMatchObject({ ok: false, reason: "used" });
  });

  it("слабый пароль не принимается, приглашение остаётся живым", async () => {
    const user = await organizer();
    const { token } = await createInvite(user.id, null);

    const result = await acceptInvite(token, "qwerty123");
    expect(result).toMatchObject({ ok: false, reason: "weak" });
    expect(await checkInvite(token)).toMatchObject({ ok: true });
  });

  it("просроченное и чужое — отказ", async () => {
    const user = await organizer();
    const { token } = await createInvite(user.id, null);

    expect(await checkInvite("нет-такого")).toEqual({ ok: false, reason: "not_found" });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + (INVITE_TTL_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(await checkInvite(token)).toEqual({ ok: false, reason: "expired" });
  });

  it("новое приглашение гасит старые неиспользованные", async () => {
    const user = await organizer();
    const first = await createInvite(user.id, null);
    await createInvite(user.id, null);

    expect(await checkInvite(first.token)).toEqual({ ok: false, reason: "used" });
  });
});
