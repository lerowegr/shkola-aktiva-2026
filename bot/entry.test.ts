import { describe, expect, it } from "vitest";

import { entryGreeting, entryKeyboard } from "./entry";

describe("выбор в приветствии бота", () => {
  it("предлагает отдельные web_app-кнопки теста и сайта", () => {
    expect(entryKeyboard("https://school.example")?.inline_keyboard).toEqual([
      [
        {
          text: "Пройти тест про ША",
          web_app: { url: "https://school.example/tg?screen=test" },
        },
      ],
      [
        {
          text: "Сайт / личный кабинет",
          web_app: { url: "https://school.example/tg?screen=site" },
        },
      ],
    ]);
  });
  it("на локальном HTTP не создаёт недопустимые кнопки", () => {
    expect(entryKeyboard("http://localhost:3000")).toBeUndefined();
    expect(entryGreeting("http://localhost:3000")).toContain(
      "http://localhost:3000/tg?screen=test",
    );
    expect(entryGreeting("http://localhost:3000")).toContain(
      "http://localhost:3000/tg?screen=site",
    );
  });
});
