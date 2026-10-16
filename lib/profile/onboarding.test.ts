import { describe, expect, it } from "vitest";

import { checkCredentials, checkOnboarding, suggestAnswers } from "./onboarding";

const good = {
  lastName: " Иванова ",
  firstName: "Анна-Мария",
  middleName: "",
  course: "1",
  faculty: "СНиМК",
  studentId: "19 01 23",
  phone: "8 (999) 123-45-67",
};

describe("checkOnboarding", () => {
  it("чистит и приводит к формату", () => {
    expect(checkOnboarding(good)).toEqual({
      ok: true,
      value: {
        lastName: "Иванова",
        firstName: "Анна-Мария",
        middleName: null,
        course: "1",
        faculty: "СНиМК",
        studentId: "190123",
        phone: "+7 (999) 123-45-67",
      },
    });
  });

  it("каждое поле — своя ошибка", () => {
    const result = checkOnboarding({ ...good, lastName: "", course: "3", faculty: "Мехмат", studentId: "12a", phone: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map((problem) => problem.field)).toEqual(["lastName", "course", "faculty", "studentId", "phone"]);
    }
  });

  it("цифры в имени — нельзя", () => {
    expect(checkOnboarding({ ...good, firstName: "Аня2" })).toMatchObject({ ok: false });
  });
});

describe("suggestAnswers", () => {
  it("курс, факультет и телефон узнаются по смыслу", () => {
    const questions = [
      { id: "c", type: "SINGLE_CHOICE", label: "Курс обучения", options: ["1 курс", "2 курс"], format: null },
      { id: "f", type: "SINGLE_CHOICE", label: "Твой факультет", options: ["МЭО", "СНиМК", "ФФ"], format: null },
      { id: "p", type: "SHORT_TEXT", label: "Телефон", options: [], format: "PHONE" },
      { id: "x", type: "SINGLE_CHOICE", label: "Размер футболки", options: ["S", "M"], format: null },
    ];
    expect(suggestAnswers(questions, { course: "2", faculty: "снимк", phone: "+7 (999) 123-45-67" })).toEqual({
      c: "2 курс",
      f: "СНиМК",
      p: "+7 (999) 123-45-67",
    });
  });

  it("«1» не путается с «11»", () => {
    const questions = [{ id: "c", type: "SINGLE_CHOICE", label: "Курс", options: ["11 класс", "1 курс"], format: null }];
    expect(suggestAnswers(questions, { course: "1", faculty: null, phone: null })).toEqual({ c: "1 курс" });
  });
});

describe("checkCredentials", () => {
  it("годные — логин и почта в нижнем регистре", () => {
    expect(checkCredentials({ login: "Anna.K", email: " Anna@Mail.ru ", password: "берёзы-у-озера", repeat: "берёзы-у-озера" })).toEqual({
      ok: true,
      value: { login: "anna.k", email: "anna@mail.ru", password: "берёзы-у-озера" },
    });
  });

  it("ошибки по полям", () => {
    const result = checkCredentials({ login: "1a", email: "mail", password: "123", repeat: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.map((problem) => problem.field)).toEqual(["login", "email", "password", "repeat"]);
    const mismatch = checkCredentials({ login: "anna", email: "a@b.ru", password: "берёзы-у-озера", repeat: "другое" });
    expect(!mismatch.ok && mismatch.problems[0]!.field).toBe("repeat");
  });
});
