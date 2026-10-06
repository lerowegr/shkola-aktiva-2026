import { describe, expect, it } from "vitest";

import { avatarLetters, displayName, fallbackCode, nicknameError, normalizeNickname } from "./display";

describe("никнейм", () => {
  it("пустой, короткий и с мусором не проходит", () => {
    expect(nicknameError("  ")).toBeTruthy();
    expect(nicknameError("ab")).toBeTruthy();
    expect(nicknameError("a".repeat(21))).toBeTruthy();
    expect(nicknameError("крутой перец!")).toBeTruthy();
    expect(nicknameError("Мастер_2026")).toBeNull();
  });

  it("зарезервированные ники заняты", () => {
    expect(nicknameError("admin")).toBeTruthy();
    expect(nicknameError("Организатор")).toBeTruthy();
    expect(nicknameError("Администратор")).toBeTruthy();
  });

  it("нормализация для уникальности", () => {
    expect(normalizeNickname("  МаСТеР_1 ")).toBe("мастер_1");
  });
});

describe("отображаемое имя", () => {
  it("ник важнее кода", () => {
    expect(displayName({ nickname: "Звезда", seq: 5 })).toBe("Звезда");
  });

  it("код стабилен, разные номера — разные коды", () => {
    expect(fallbackCode(7)).toBe(fallbackCode(7));
    expect(new Set([1, 2, 3, 100, 5000].map(fallbackCode)).size).toBe(5);
    expect(displayName({ nickname: null, seq: 7 })).toMatch(/^Игрок [0-9A-Z]{4}$/);
  });

  it("буквы заглушки — первые два символа", () => {
    expect(avatarLetters("Звезда")).toBe("ЗВ");
    expect(avatarLetters("Игрок К7М2")).toBe("ИГ");
  });
});
