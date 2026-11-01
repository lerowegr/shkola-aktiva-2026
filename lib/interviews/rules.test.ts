import { describe, expect, it } from "vitest";
import { bookingDeadline, canBook, canReschedule } from "./rules";

describe("дедлайны собеседований по Москве", () => {
  it("2 ноября — до 02:00 в день собеседования, независимо от времени встречи", () => {
    for (const at of ["2026-11-02T08:30:00+03:00", "2026-11-02T22:00:00+03:00"]) {
      expect(bookingDeadline(at).toISOString()).toBe("2026-11-01T23:00:00.000Z");
      expect(canBook(at, new Date("2026-11-02T01:59:59+03:00"))).toBe(true);
      expect(canBook(at, new Date("2026-11-02T02:00:00+03:00"))).toBe(true);
      expect(canBook(at, new Date("2026-11-02T02:00:01+03:00"))).toBe(false);
    }
  });
  it("остальные дни — до 20:00 накануне, переход месяца и года корректен", () => {
    for (const [start, deadline] of [["2026-11-03T19:00:00+03:00", "2026-11-02T20:00:00+03:00"], ["2027-01-01T08:30:00+03:00", "2026-12-31T20:00:00+03:00"]]) {
      const at = new Date(deadline!);
      expect(bookingDeadline(start!)).toEqual(at);
      expect(canBook(start!, new Date(+at - 1000))).toBe(true);
      expect(canBook(start!, at)).toBe(true);
      expect(canBook(start!, new Date(+at + 1000))).toBe(false);
    }
  });
  it("первичная запись после 18:00 разрешена, перенос уже запрещён", () => {
    const now = new Date("2026-11-02T19:00:00+03:00");
    expect(canBook("2026-11-03T08:30:00+03:00", now)).toBe(true);
    expect(canReschedule("2026-11-03T08:30:00+03:00", 0, now)).toBe(false);
  });
});
