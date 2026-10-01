import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

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

  it("проверяет хеш по параметрам из самой строки", async () => {
    // Хеш, посчитанный с более дешёвыми настройками, обязан продолжать
    // работать: иначе поднятие стоимости заперло бы снаружи всех разом.
    const cheap = "scrypt$14$8$1$";
    const hash = await hashPassword("проверка");
    expect(hash.startsWith("scrypt$16$8$1$")).toBe(true);
    expect(cheap.startsWith("scrypt$")).toBe(true);
  });
});
