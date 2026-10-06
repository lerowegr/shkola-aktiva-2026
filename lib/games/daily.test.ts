import { describe, expect, it } from "vitest";

import { addDays, dailyKind, mskDate, seedFromDate, streakOf } from "./daily";

describe("ежедневное: московский день", () => {
  it("день — YYYY-MM-DD по Москве, а не по серверу", () => {
    // 02:30 МСК 5 октября — в UTC ещё 4 октября.
    expect(mskDate(new Date("2026-10-04T23:30:00Z"))).toBe("2026-10-05");
    expect(mskDate(new Date("2026-10-04T20:30:00Z"))).toBe("2026-10-04");
  });

  it("тот же день — тот же сид, разные дни — разные", () => {
    expect(seedFromDate("2026-10-05")).toBe(seedFromDate("2026-10-05"));
    expect(seedFromDate("2026-10-05")).not.toBe(seedFromDate("2026-10-06"));
  });

  it("вид задания чередуется и покрывает все три", () => {
    const kinds = new Set([0, 1, 2, 3, 4, 5].map((n) => dailyKind(addDays("2026-10-05", n))));
    expect(kinds.size).toBe(3);
  });
});

describe("ежедневное: серия", () => {
  it("серия считается назад от сегодня, пропуск обнуляет", () => {
    expect(streakOf(["2026-10-03", "2026-10-04", "2026-10-05"], "2026-10-05")).toEqual({ current: 3, best: 3 });
    expect(streakOf(["2026-10-03", "2026-10-05"], "2026-10-05")).toEqual({ current: 1, best: 1 });
    expect(streakOf(["2026-10-01", "2026-10-02", "2026-10-04"], "2026-10-05")).toEqual({ current: 1, best: 2 });
  });

  it("вчерашняя серия ещё жива, пока сегодня не решено", () => {
    expect(streakOf(["2026-10-03", "2026-10-04"], "2026-10-05")).toEqual({ current: 2, best: 2 });
  });

  it("без решений — нули", () => {
    expect(streakOf([], "2026-10-05")).toEqual({ current: 0, best: 0 });
  });
});
