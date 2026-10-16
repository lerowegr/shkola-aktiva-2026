import { describe, expect, it } from "vitest";

import { loginKind, loginProblem, normalizeLogin } from "./login";

describe("логин", () => {
  it("годные", () => {
    for (const value of ["anna", "Anna.K", "ivan_2006", "a1b"]) expect(loginProblem(value)).toBeNull();
    expect(normalizeLogin("  Anna.K ")).toBe("anna.k");
  });

  it("негодные — с объяснением", () => {
    expect(loginProblem("")).toMatch(/Придумайте/);
    expect(loginProblem("ab")).toMatch(/от 3/);
    expect(loginProblem("1anna")).toMatch(/латинской/);
    expect(loginProblem("анна")).toMatch(/латинской/);
    expect(loginProblem("an na")).toMatch(/только/);
    expect(loginProblem("anna@mail")).toMatch(/только/);
    expect(loginProblem("an..na")).toMatch(/подряд/);
    expect(loginProblem("anna_")).toMatch(/в конце/);
    expect(loginProblem("a".repeat(33))).toMatch(/до 32/);
  });

  it("почта или логин", () => {
    expect(loginKind("anna@mail.ru")).toBe("email");
    expect(loginKind("anna")).toBe("login");
  });
});
