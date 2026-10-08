import { describe, expect, it } from "vitest";

import { formatValue, isEmptyAnswer, normalizeAnswer, stepProblems, submitProblems, type QuestionShape } from "./form";

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
  const profile = { lastName: "Смирнова", firstName: "Алина", studentId: "190123" };

  it("всё заполнено — проблем нет", () => {
    const questions = [q(), q({ id: "q2", required: false })];
    expect(submitProblems(questions, { q1: "ответ" }, profile)).toEqual([]);
  });

  it("пустые фамилия и имя — проблема", () => {
    const problems = submitProblems([], {}, { lastName: " ", firstName: null, studentId: "1" });
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

describe("formatValue — приведение к единому виду", () => {
  const ok = (value: string) => ({ ok: true, value });

  it("ВК: любые записи — ссылка на vk.ru", () => {
    expect(formatValue("VK", "vk.com/ivan")).toEqual(ok("https://vk.ru/ivan"));
    expect(formatValue("VK", "https://vk.com/id123")).toEqual(ok("https://vk.ru/id123"));
    expect(formatValue("VK", "https://m.vk.com/ivan.petrov?from=1")).toEqual(ok("https://vk.ru/ivan.petrov"));
    expect(formatValue("VK", "@ivan")).toEqual(ok("https://vk.ru/ivan"));
    expect(formatValue("VK", " ivan ")).toEqual(ok("https://vk.ru/ivan"));
    expect(formatValue("VK", "vk.ru/ivan")).toEqual(ok("https://vk.ru/ivan"));
  });

  it("ВК: чужой сайт и пустая ссылка — ошибка", () => {
    expect(formatValue("VK", "https://t.me/ivan").ok).toBe(false);
    expect(formatValue("VK", "vk.com/").ok).toBe(false);
    expect(formatValue("VK", "иван петров").ok).toBe(false);
  });

  it("Telegram: t.me, @ и просто ник — @ник", () => {
    expect(formatValue("TELEGRAM", "t.me/ivan_99")).toEqual(ok("@ivan_99"));
    expect(formatValue("TELEGRAM", "https://t.me/Ivan_99")).toEqual(ok("@Ivan_99"));
    expect(formatValue("TELEGRAM", "ivanpetrov")).toEqual(ok("@ivanpetrov"));
    expect(formatValue("TELEGRAM", "@ivanpetrov")).toEqual(ok("@ivanpetrov"));
  });

  it("Telegram: короткий ник и кириллица — ошибка", () => {
    expect(formatValue("TELEGRAM", "@ivan").ok).toBe(false);
    expect(formatValue("TELEGRAM", "@иван_петров").ok).toBe(false);
  });

  it("телефон: 8, +7, без кода страны — +7 (XXX) XXX-XX-XX", () => {
    expect(formatValue("PHONE", "8 999 123-45-67")).toEqual(ok("+7 (999) 123-45-67"));
    expect(formatValue("PHONE", "+79991234567")).toEqual(ok("+7 (999) 123-45-67"));
    expect(formatValue("PHONE", "9991234567")).toEqual(ok("+7 (999) 123-45-67"));
    expect(formatValue("PHONE", "123-45").ok).toBe(false);
    expect(formatValue("PHONE", "5 999 123 45 67").ok).toBe(false);
  });

  it("группа: верхний регистр без пробелов, длинное тире — дефис", () => {
    expect(formatValue("GROUP", "тцбм 23-2")).toEqual(ok("ТЦБМ23-2"));
    expect(formatValue("GROUP", "ТЦБМ23–12")).toEqual(ok("ТЦБМ23-12"));
    expect(formatValue("GROUP", "ТЦБМ").ok).toBe(false);
    expect(formatValue("GROUP", "ТЦБМ23/2").ok).toBe(false);
  });

  it("только цифры: пробелы убираются, буквы — ошибка", () => {
    expect(formatValue("DIGITS", " 190 123 ")).toEqual(ok("190123"));
    expect(formatValue("DIGITS", "19О123").ok).toBe(false);
  });

  it("пустое — не ошибка формата: обязательность проверяется отдельно", () => {
    expect(formatValue("PHONE", "  ")).toEqual(ok(""));
  });
});

describe("форматы и минимум в анкете", () => {
  const profile = { lastName: "Смирнова", firstName: "Алина", studentId: "190123" };

  it("автосохранение хранит приведённое, если ввод уже верный, и как есть — если нет", () => {
    const phone = q({ format: "PHONE" });
    expect(normalizeAnswer(phone, "89991234567")).toEqual({ ok: true, value: "+7 (999) 123-45-67" });
    expect(normalizeAnswer(phone, "8999")).toEqual({ ok: true, value: "8999" });
  });

  it("при отправке формат обязателен", () => {
    const vk = q({ format: "VK", label: "ВК" });
    expect(submitProblems([vk], { q1: "vk.com/ivan" }, profile)).toEqual([]);
    expect(submitProblems([vk], { q1: "t.me/ivan" }, profile)[0]?.field).toBe("q1");
  });

  it("развёрнутый ответ короче минимума — сколько осталось", () => {
    const long = q({ type: "LONG_TEXT", minLength: 200, label: "Опыт" });
    const [problem] = submitProblems([long], { q1: "а".repeat(150) }, profile);
    expect(problem?.message).toContain("ещё 50 знаков");
    expect(submitProblems([long], { q1: "а".repeat(200) }, profile)).toEqual([]);
  });

  it("студенческий — обязательный и только цифры", () => {
    const fields = (studentId: string | null) =>
      submitProblems([], {}, { ...profile, studentId }).map((problem) => problem.field);
    expect(fields(null)).toEqual(["studentId"]);
    expect(fields("19-01")).toEqual(["studentId"]);
    expect(fields("190 123")).toEqual([]);
  });

  it("проверка шага — только поля этого раздела", () => {
    const first = q({ id: "a" });
    const second = q({ id: "b" });
    const problems = stepProblems([first, second], {}, profile, ["a"]);
    expect(problems.map((problem) => problem.field)).toEqual(["a"]);
    expect(stepProblems([first], {}, { ...profile, lastName: "" }, ["a", "lastName"]).map((p) => p.field)).toEqual([
      "lastName",
      "a",
    ]);
  });
});
