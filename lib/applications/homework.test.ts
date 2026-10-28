import { describe, expect, it } from "vitest";

import { homeworkLinks, homeworkText } from "./homework";

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

describe("прямые ссылки на ДЗ", () => {
  it("сохраняет подписи заданий и объединяет повторяющуюся папку", () => {
    expect(homeworkLinks("Задание 1: https://drive.google.com/drive/folders/one\nЗадание 2: https://drive.google.com/drive/folders/one\nПереписка: https://example.org/task?view=1&x=2")).toEqual([
      { label: "Задание 1", url: "https://drive.google.com/drive/folders/one" },
      { label: "Переписка", url: "https://example.org/task?view=1&x=2" },
    ]);
  });

  it("не создаёт ссылки из пустого ответа, опасных схем, адресов с паролем и битых URL", () => {
    expect(homeworkLinks(null)).toEqual([]);
    expect(homeworkLinks("javascript:alert(1)\ndata:text/html,test\n//example.org\nhttps://user:pass@example.org\nhttps://[")).toEqual([]);
  });

  it("поддерживает несколько адресов в строке, старое ДЗ без подписи и точку после адреса", () => {
    expect(homeworkLinks("https://example.org/a, https://example.org/b.")).toEqual([
      { label: "Домашнее задание", url: "https://example.org/a" },
      { label: "Домашнее задание", url: "https://example.org/b" },
    ]);
  });
});
