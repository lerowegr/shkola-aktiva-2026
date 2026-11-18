import { Api, InputFile } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTelegramSender, miniAppLink, telegramButton, telegramText } from "./telegram-sender";

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

describe("заявление в приглашении", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([false, true])("отправляет DOCX и полный текст (длинный текст: %s)", async (long) => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test");
    vi.stubEnv("NUXT_PUBLIC_APP_URL", "https://sha.example");
    const sendDocument = vi.spyOn(Api.prototype, "sendDocument").mockImplementation(async () => {
      return {} as Awaited<ReturnType<Api["sendDocument"]>>;
    });
    const sendMessage = vi.spyOn(Api.prototype, "sendMessage").mockImplementation(async () => {
      return {} as Awaited<ReturnType<Api["sendMessage"]>>;
    });
    const body = long ? "Текст приглашения ".repeat(80) : "Заполни анкету";
    await createTelegramSender()!("123", {
      title: "Приглашение", body, url: "/cabinet/participation", attachment: "parentConsent",
    });

    expect(sendDocument).toHaveBeenCalledOnce();
    expect(sendDocument.mock.calls[0]?.[1]).toBeInstanceOf(InputFile);
    expect(sendDocument.mock.calls[0]?.[2]?.caption).toContain("Заявление для несовершеннолетних");
    if (long) {
      expect(sendMessage).toHaveBeenCalledOnce();
      expect(sendMessage.mock.calls[0]?.[1]).toContain(body);
    } else {
      expect(sendMessage).not.toHaveBeenCalled();
      expect(sendDocument.mock.calls[0]?.[2]).toMatchObject({
        caption: expect.stringContaining(body),
        reply_markup: {
          inline_keyboard: [[{
            text: "Открыть анкету",
            web_app: { url: "https://sha.example/tg?to=%2Fcabinet%2Fparticipation" },
          }]],
        },
      });
    }
  });
});
