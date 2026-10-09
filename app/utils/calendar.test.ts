import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatTime,
  monthGrid,
  monthName,
  parseDate,
  parseDateTime,
  parseTime,
  shiftMonth,
  WEEKDAYS,
} from "./calendar";

describe("сетка месяца", () => {
  it("октябрь 2026 начинается с четверга: три дня сентября, недели с понедельника", () => {
    const grid = monthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid.slice(0, 4).map((cell) => [cell.day, cell.current])).toEqual([
      [28, false],
      [29, false],
      [30, false],
      [1, true],
    ]);
    expect(WEEKDAYS).toEqual(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);
  });

  it("переход через год в обе стороны", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("название месяца по-русски", () => {
    expect(monthName(2026, 9)).toMatch(/октябр/);
  });
});

describe("разбор и сборка", () => {
  it("дата-время туда-обратно, мусор — null", () => {
    expect(parseDateTime("2026-10-09T12:30")).toEqual({ year: 2026, month: 9, day: 9, hour: 12, minute: 30 });
    expect(formatDateTime({ year: 2026, month: 9, day: 9, hour: 12, minute: 30 })).toBe("2026-10-09T12:30");
    expect(parseDateTime("")).toBeNull();
    expect(parseDateTime("2026-13-99T99:99")).toBeNull();
  });

  it("дата и время отдельно", () => {
    expect(parseDate("2026-10-09")).toEqual({ year: 2026, month: 9, day: 9 });
    expect(formatDate({ year: 2026, month: 9, day: 9 })).toBe("2026-10-09");
    expect(parseTime("09:05")).toEqual({ hour: 9, minute: 5 });
    expect(formatTime({ hour: 9, minute: 5 })).toBe("09:05");
    expect(parseTime("ab")).toBeNull();
  });
});
