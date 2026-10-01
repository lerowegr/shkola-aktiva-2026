import { describe, expect, it } from "vitest";

import { miniAppLink, telegramButton, telegramText } from "./telegram-sender";

const message = { title: "Вам <ответили>", body: "Откройте & прочитайте", url: "/cabinet/messages" };

describe("сообщение бота", () => {
  it("экранирует HTML и на https не пишет адрес строкой", () => {
    expect(telegramText(message, "https://sha.example")).toBe(
      "<b>Вам &lt;ответили&gt;</b>\n\nОткройте &amp; прочитайте",
    );
  });

  it("локально адрес строкой, кнопки нет", () => {
    expect(telegramText(message, "http://localhost:3000")).toContain("http://localhost:3000/cabinet/messages");
    expect(telegramButton(message, "http://localhost:3000")).toBeUndefined();
  });

  it("кнопка открывает Mini App на нужном экране", () => {
    expect(miniAppLink("/cabinet/messages", "https://sha.example")).toBe(
      "https://sha.example/tg?to=%2Fcabinet%2Fmessages",
    );
    expect(telegramButton(message, "https://sha.example")).toBeDefined();
  });
});
