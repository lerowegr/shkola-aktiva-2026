import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { verifyPassword } from "./password";
import { registerWithPassword, REGISTRATIONS_PER_HOUR } from "./register";

describe("регистрация по логину", () => {
  beforeEach(resetDatabase);

  it("создаёт человека с хешем пароля, логин без регистра", async () => {
    const result = await registerWithPassword({ login: " Anna.K ", password: "солнце-над-озером", repeat: "солнце-над-озером", ip: "1.1.1.1" });
    expect(result.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { login: "anna.k" }, select: { passwordHash: true } });
    expect(await verifyPassword("солнце-над-озером", user.passwordHash!)).toBe(true);
  });

  it("занятый логин, слабый пароль, несовпадение — понятные отказы", async () => {
    await registerWithPassword({ login: "anna", password: "солнце-над-озером", repeat: "солнце-над-озером", ip: null });
    expect(await registerWithPassword({ login: "ANNA", password: "солнце-над-озером", repeat: "солнце-над-озером", ip: null })).toMatchObject({ ok: false, field: "login" });
    expect(await registerWithPassword({ login: "boris", password: "123", repeat: "123", ip: null })).toMatchObject({ ok: false, field: "password" });
    expect(await registerWithPassword({ login: "boris", password: "boris-pass-1", repeat: "boris-pass-1", ip: null })).toMatchObject({ ok: false, field: "password" });
    expect(await registerWithPassword({ login: "boris", password: "солнце-над-озером", repeat: "другое", ip: null })).toMatchObject({ ok: false, field: "repeat" });
  });

  it("лимит регистраций с одного адреса", async () => {
    for (let i = 0; i < REGISTRATIONS_PER_HOUR; i++) {
      expect((await registerWithPassword({ login: `user${i}`, password: "солнце-над-озером", repeat: "солнце-над-озером", ip: "2.2.2.2" })).ok).toBe(true);
    }
    expect(await registerWithPassword({ login: "extra", password: "солнце-над-озером", repeat: "солнце-над-озером", ip: "2.2.2.2" })).toMatchObject({ ok: false });
    expect((await registerWithPassword({ login: "other", password: "солнце-над-озером", repeat: "солнце-над-озером", ip: "3.3.3.3" })).ok).toBe(true);
  });
});
