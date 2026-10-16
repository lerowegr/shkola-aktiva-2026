import { describe, expect, it } from "vitest";

import { homeworkText } from "./homework";

const questions = [
  { id: "q1", section: "О себе", label: "Курс" },
  { id: "h1", section: "Домашнее задание", label: "Задание 1. Защита инициативы" },
  { id: "h2", section: "Домашнее задание", label: "Задание 2. Переписка" },
];

describe("сдача ДЗ из ответов анкеты", () => {
  it("только раздел ДЗ, по строке на задание, пустые пропускаем", () => {
    expect(homeworkText(questions, new Set(["Домашнее задание"]), { q1: "1 курс", h1: " https://disk.yandex.ru/a ", h2: "" })).toBe(
      "Задание 1. Защита инициативы: https://disk.yandex.ru/a",
    );
  });

  it("нет раздела ДЗ или ответов — сдачи нет", () => {
    expect(homeworkText(questions, new Set(), { h1: "https://x" })).toBeNull();
    expect(homeworkText(questions, new Set(["Домашнее задание"]), {})).toBeNull();
  });
});
