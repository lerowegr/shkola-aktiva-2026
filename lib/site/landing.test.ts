import { describe, expect, it } from "vitest";

import { daysLeft, latestEvents, timeline } from "./landing";

// Анкета закрывается 15 октября в 23:59 по Москве.
const closes = new Date("2026-10-15T20:59:00Z");

describe("сколько осталось до закрытия анкеты", () => {
  it("склоняет дни", () => {
    expect(daysLeft(closes, new Date("2026-10-14T09:00:00Z"))).toBe("остался 1 день");
    expect(daysLeft(closes, new Date("2026-10-13T09:00:00Z"))).toBe("осталось 2 дня");
    expect(daysLeft(closes, new Date("2026-10-10T09:00:00Z"))).toBe("осталось 5 дней");
    expect(daysLeft(closes, new Date("2026-10-04T09:00:00Z"))).toBe("осталось 11 дней");
    expect(daysLeft(new Date("2026-11-15T20:59:00Z"), new Date("2026-10-25T09:00:00Z"))).toBe("остался 21 день");
  });

  it("день закрытия по Москве — «последний день», даже когда в UTC ещё вчера", () => {
    // 15 октября, 00:30 по Москве = 14 октября, 21:30 UTC.
    expect(daysLeft(closes, new Date("2026-10-14T21:30:00Z"))).toBe("последний день");
    expect(daysLeft(closes, new Date("2026-10-14T20:30:00Z"))).toBe("остался 1 день");
  });

  it("закрыто или даты нет — строки нет", () => {
    expect(daysLeft(closes, new Date("2026-10-15T21:00:00Z"))).toBeNull();
    expect(daysLeft(null)).toBeNull();
  });
});

describe("история", () => {
  const items = [
    { year: "2023", title: "a" },
    { year: "без года", title: "b" },
    { year: "2025", title: "c" },
    { year: "2024–2025", title: "d" },
    { year: "2025", title: "e" },
  ];

  it("последние события — по году, свежие первыми, при равенстве — как расставили", () => {
    expect(latestEvents(items).map((item) => item.title)).toEqual(["c", "e", "d"]);
  });

  it("таймлайн — по годам от старых, без года — в конце", () => {
    expect(timeline(items).map((item) => item.title)).toEqual(["a", "d", "c", "e", "b"]);
  });
});
