import { describe, expect, it } from "vitest";

import { loginToEmail } from "./preview-login";

describe("тестовый вход по логину", () => {
  it("на превью короткий логин превращается в демо-адрес", () => {
    expect(loginToEmail(" Admin ", true)).toBe("admin@demo.local");
    expect(loginToEmail("orlova@mail.ru", true)).toBe("orlova@mail.ru");
  });

  it("без включённого превью логин без «@» никуда не ведёт", () => {
    expect(loginToEmail("admin", false)).toBe("admin");
  });
});
