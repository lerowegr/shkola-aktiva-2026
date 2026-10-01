import { describe, expect, it } from "vitest";

import { passwordProblem } from "./password-rules";

describe("passwordProblem", () => {
  it("пропускает нормальный пароль", () => {
    expect(passwordProblem("кораблик в тумане")).toBeNull();
    expect(passwordProblem("Nq7fLm2x")).toBeNull();
  });

  it("не пускает короткий", () => {
    expect(passwordProblem("коротк")).toContain("короче");
  });

  it("не пускает очевидный", () => {
    expect(passwordProblem("qwerty123")).toContain("подбора");
    expect(passwordProblem("password1")).toContain("подбора");
  });

  it("не пускает пароль из одного знака", () => {
    expect(passwordProblem("аааааааааа")).toContain("один-два");
  });

  it("не пускает пароль, собранный из почты", () => {
    expect(passwordProblem("ivanov2026", { email: "ivanov@edu.fa.ru" })).toContain("почту");
    // Чужая почта пароль не портит.
    expect(passwordProblem("ivanov2026", { email: "petrov@edu.fa.ru" })).toBeNull();
  });

  it("не спотыкается о слишком короткий адрес", () => {
    // Локальная часть из двух букв встречается в любом пароле по случайности.
    expect(passwordProblem("abcdefgh", { email: "ab@edu.fa.ru" })).toBeNull();
  });
});
