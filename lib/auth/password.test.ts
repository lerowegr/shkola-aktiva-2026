import { describe, expect, it } from "vitest";
import { randomBytes, scryptSync } from "node:crypto";

import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("принимает верный пароль и отвергает неверный", async () => {
    const hash = await hashPassword("кораблик-в-тумане");
    expect(await verifyPassword("кораблик-в-тумане", hash)).toBe(true);
    expect(await verifyPassword("кораблик-в-тумане ", hash)).toBe(false);
    expect(await verifyPassword("другой пароль", hash)).toBe(false);
  });

  it("на один пароль даёт разные хеши — соль своя у каждого", async () => {
    const a = await hashPassword("одинаковый");
    const b = await hashPassword("одинаковый");
    expect(a).not.toBe(b);
    expect(await verifyPassword("одинаковый", a)).toBe(true);
    expect(await verifyPassword("одинаковый", b)).toBe(true);
  });

  it("сравнивает по буквам, а не по байтам: ё и е — разные пароли", async () => {
    const hash = await hashPassword("тёплый вечер");
    expect(await verifyPassword("теплый вечер", hash)).toBe(false);
  });

  it("не падает на мусоре вместо хеша", async () => {
    expect(await verifyPassword("что угодно", null)).toBe(false);
    expect(await verifyPassword("что угодно", "")).toBe(false);
    expect(await verifyPassword("что угодно", "не-хеш")).toBe(false);
    expect(await verifyPassword("что угодно", "scrypt$99$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });

  it("старый хеш (2^16) по-прежнему впускает и помечается на пересчёт", async () => {
    // Параметры читаются из самой строки: смена стоимости никого не запирает.
    const salt = randomBytes(16);
    const key = scryptSync("проверка", salt, 64, { N: 1 << 16, r: 8, p: 1, maxmem: 80 * 1024 * 1024 });
    const old = ["scrypt", 16, 8, 1, salt.toString("base64"), key.toString("base64")].join("$");
    expect(await verifyPassword("проверка", old)).toBe(true);
    expect(needsRehash(old)).toBe(true);

    const fresh = await hashPassword("проверка");
    expect(fresh.startsWith("scrypt$14$8$1$")).toBe(true);
    expect(needsRehash(fresh)).toBe(false);
  });
});
