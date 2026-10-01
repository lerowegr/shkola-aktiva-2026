import { describe, expect, it } from "vitest";

import { isEmptyAnswer, normalizeAnswer, submitProblems, type QuestionShape } from "./form";

function q(overrides: Partial<QuestionShape> = {}): QuestionShape {
  return {
    id: "q1",
    label: "Вопрос",
    type: "SHORT_TEXT",
    required: true,
    options: [],
    maxLength: null,
    ...overrides,
  };
}

describe("normalizeAnswer — то, что можно сохранить черновиком", () => {
  it("текст сохраняется как есть, пустой — тоже", () => {
    expect(normalizeAnswer(q(), "Привет ")).toEqual({ ok: true, value: "Привет " });
    expect(normalizeAnswer(q(), "")).toEqual({ ok: true, value: "" });
  });

  it("текст длиннее maxLength не сохраняется", () => {
    const result = normalizeAnswer(q({ maxLength: 5 }), "шесть!");
    expect(result.ok).toBe(false);
  });

  it("не строка в текстовом вопросе — отказ", () => {
    expect(normalizeAnswer(q(), 42).ok).toBe(false);
  });

  it("один вариант — только из списка или пусто", () => {
    const question = q({ type: "SINGLE_CHOICE", options: ["Очная", "Заочная"] });
    expect(normalizeAnswer(question, "Очная")).toEqual({ ok: true, value: "Очная" });
    expect(normalizeAnswer(question, "")).toEqual({ ok: true, value: "" });
    expect(normalizeAnswer(question, "Вечерняя").ok).toBe(false);
  });

  it("мультивыбор чистит дубли и держит порядок списка", () => {
    const question = q({ type: "MULTI_CHOICE", options: ["А", "Б", "В"] });
    expect(normalizeAnswer(question, ["В", "А", "В"])).toEqual({ ok: true, value: ["А", "В"] });
    expect(normalizeAnswer(question, ["Г"]).ok).toBe(false);
    expect(normalizeAnswer(question, "А").ok).toBe(false);
  });

  it("ссылку в черновике не проверяем — человек ещё печатает", () => {
    expect(normalizeAnswer(q({ type: "URL" }), "vk.co")).toEqual({ ok: true, value: "vk.co" });
  });
});

describe("isEmptyAnswer", () => {
  it("пробелы и пустой список — пусто", () => {
    expect(isEmptyAnswer("   ")).toBe(true);
    expect(isEmptyAnswer([])).toBe(true);
    expect(isEmptyAnswer(undefined)).toBe(true);
    expect(isEmptyAnswer("да")).toBe(false);
    expect(isEmptyAnswer(["А"])).toBe(false);
  });
});

describe("submitProblems — что мешает отправить", () => {
  const profile = { lastName: "Смирнова", firstName: "Алина" };

  it("всё заполнено — проблем нет", () => {
    const questions = [q(), q({ id: "q2", required: false })];
    expect(submitProblems(questions, { q1: "ответ" }, profile)).toEqual([]);
  });

  it("пустые фамилия и имя — проблема", () => {
    const problems = submitProblems([], {}, { lastName: " ", firstName: null });
    expect(problems.map((p) => p.field)).toEqual(["lastName", "firstName"]);
  });

  it("пустой обязательный ответ — проблема с подписью вопроса", () => {
    const problems = submitProblems([q({ label: "Хобби" })], { q1: "  " }, profile);
    expect(problems).toEqual([{ field: "q1", message: "Ответьте на вопрос «Хобби»." }]);
  });

  it("ссылка проверяется при отправке", () => {
    const url = q({ type: "URL", label: "ВК" });
    expect(submitProblems([url], { q1: "vk.com/id1" }, profile)).toEqual([]);
    expect(submitProblems([url], { q1: "https://vk.com/id1" }, profile)).toEqual([]);
    expect(submitProblems([url], { q1: "просто текст" }, profile)).toHaveLength(1);
    expect(submitProblems([url], { q1: "javascript:alert(1)" }, profile)).toHaveLength(1);
  });

  it("необязательную ссылку можно оставить пустой", () => {
    expect(submitProblems([q({ type: "URL", required: false })], {}, profile)).toEqual([]);
  });
});
