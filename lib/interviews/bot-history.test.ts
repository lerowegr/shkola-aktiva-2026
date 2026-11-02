import { describe, expect, it } from "vitest";
import { botTextPages, reviewHistoryText } from "./bot-history";

describe("история оценок в Telegram", () => {
  it("показывает критерии, комментарии и маркеры всех предыдущих этапов", () => {
    const text = reviewHistoryText({ stages: [
      { label: "Анкета", reviews: [{ reviewer: "Мастер", total: 4, max: 5, percent: 80, status: "done", comment: "Итог", criteria: [{ title: "Мотивация", max: 5, score: 4, comment: "Хорошо" }], markers: [{ title: "Лидерство", note: "Проявил" }] }] },
      { label: "Домашнее задание", reviews: [] },
      { label: "Центр оценки", reviews: [] },
    ] });
    expect(text).toContain("АНКЕТА");
    expect(text).toContain("Мотивация: 4/5");
    expect(text).toContain("Комментарий к критерию: Хорошо");
    expect(text).toContain("Маркер «Лидерство»: Проявил");
    expect(text).toContain("Общий комментарий: Итог");
    expect(text).toContain("ДОМАШНЕЕ ЗАДАНИЕ");
    expect(text).toContain("ЦЕНТР ОЦЕНКИ");
  });
  it("не теряет данные и не режет emoji на границе страниц", () => {
    const source = "а".repeat(3399) + "😀" + "б".repeat(7000);
    const pages = botTextPages(source);
    expect(pages.join("")).toBe(source);
    expect(pages.every(page => page.length <= 3400)).toBe(true);
    expect(pages[0]?.endsWith("\uD83D")).toBe(false);
  });
});
