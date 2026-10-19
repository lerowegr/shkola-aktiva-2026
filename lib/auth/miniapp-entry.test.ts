import { describe, expect, it } from "vitest";

import {
  miniAppSitePath,
  miniAppTarget,
  testNextAction,
} from "./miniapp-entry";

const newcomer = { isStaff: false, needsProfile: true };
const candidate = { isStaff: false, needsProfile: false };
const staff = { isStaff: true, needsProfile: false };

describe("выбор входа Mini App", () => {
  it("обычный вход оставляет выбор, тест открывается без знакомства", () => {
    for (const user of [null, newcomer, candidate, staff]) {
      expect(miniAppTarget(undefined, undefined, user)).toBeNull();
      expect(miniAppTarget("test", undefined, user)).toBe("/test");
    }
  });

  it("сайт учитывает пройденную регистрацию и кабинет организатора", () => {
    expect(miniAppSitePath(null)).toBe("/");
    expect(miniAppTarget("site", null, newcomer)).toBe("/");
    expect(miniAppTarget("site", null, candidate)).toBe("/cabinet");
    expect(miniAppTarget("site", null, staff)).toBe("/staff");
  });

  it("ссылки уведомлений ведут сразу к нужному разделу", () => {
    expect(
      miniAppTarget("test", "/cabinet/messages?thread=123", candidate),
    ).toBe("/cabinet/messages?thread=123");
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\nevil.test",
    "/tg",
    "/tg?to=/tg",
    ["/cabinet"],
  ])("отвергает внешнюю или зацикленную цель %s", (to) => {
    expect(miniAppTarget(undefined, to, candidate)).toBeNull();
  });

  it("после результата предлагает регистрацию или свой кабинет", () => {
    expect(testNextAction(newcomer)).toEqual({
      href: "/cabinet/welcome",
      label: "Зарегистрироваться на ША",
    });
    expect(testNextAction(candidate).href).toBe("/cabinet");
    expect(testNextAction(staff).href).toBe("/staff");
    expect(testNextAction(null).href).toBe("/");
  });
});
