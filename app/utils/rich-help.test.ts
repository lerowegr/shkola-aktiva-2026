import { describe, expect, it } from "vitest";

import { linkParts, parseHelp } from "./rich-help";

describe("parseHelp", () => {
  it("без чата — один текстовый блок", () => {
    expect(parseHelp("Абзац один.\n\nАбзац два.")).toEqual([{ kind: "text", text: "Абзац один.\n\nАбзац два." }]);
  });

  it("переписка: имя начинает сообщение, строки дописываются", () => {
    const blocks = parseHelp("Вступление\n\n[чат]\nКатя: Привет!\nЗачем тебе это?\nЯ: Сейчас расскажу\n[/чат]\n\nТвоя задача");
    expect(blocks).toEqual([
      { kind: "text", text: "Вступление" },
      { kind: "chat", messages: [{ author: "Катя", text: "Привет!\nЗачем тебе это?" }, { author: "Я", text: "Сейчас расскажу" }] },
      { kind: "text", text: "Твоя задача" },
    ]);
  });

  it("двоеточие внутри фразы — не автор", () => {
    const [block] = parseHelp("[чат]\nКатя: Смотри: вот так\n[/чат]");
    expect(block).toEqual({ kind: "chat", messages: [{ author: "Катя", text: "Смотри: вот так" }] });
  });

  it("длинная фраза с двоеточием внутри сообщения — продолжение, не автор", () => {
    const [block] = parseHelp("[чат]\nКатя: Привет!\nТем более сейчас и так дел куча: разгар аттестации\n[/чат]");
    expect(block).toEqual({ kind: "chat", messages: [{ author: "Катя", text: "Привет!\nТем более сейчас и так дел куча: разгар аттестации" }] });
  });
});

describe("linkParts", () => {
  it("ссылки отдельно, точка в конце не в ссылке", () => {
    expect(linkParts("Задание 1: https://disk.yandex.ru/d/abc. Ещё")).toEqual([
      { text: "Задание 1: ", href: null },
      { text: "https://disk.yandex.ru/d/abc", href: "https://disk.yandex.ru/d/abc" },
      { text: ". Ещё", href: null },
    ]);
  });
});
