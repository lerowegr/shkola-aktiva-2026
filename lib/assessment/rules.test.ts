import { describe, expect, it } from "vitest";

import { balance, placeChanged, placeLine, placeOf, placeProblem, readPlace } from "./rules";

describe("balance", () => {
  it("без групп — никого не раскладывает", () => {
    expect(balance([], ["a"]).size).toBe(0);
  });

  it("поровну по пустым группам, остаток — в верхние", () => {
    const placed = balance(
      [{ id: "g1", size: 0 }, { id: "g2", size: 0 }, { id: "g3", size: 0 }],
      ["a", "b", "c", "d", "e", "f", "g"],
    );
    const sizes = ["g1", "g2", "g3"].map((id) => [...placed.values()].filter((group) => group === id).length);
    expect(sizes).toEqual([3, 2, 2]);
  });

  it("догоняет маленькие группы", () => {
    const placed = balance([{ id: "big", size: 5 }, { id: "small", size: 1 }], ["a", "b", "c"]);
    expect([...placed.values()]).toEqual(["small", "small", "small"]);
  });
});

describe("место", () => {
  const place = placeOf({ building: " 2 ", room: "305", startsAt: new Date("2026-10-15T15:00:00Z"), note: "" });

  it("пустое — null, пробелы срезаны", () => {
    expect(place).toEqual({ building: "2", room: "305", startsAt: "2026-10-15T15:00:00.000Z", note: null });
  });

  it("без снимка — не «изменилось»", () => {
    expect(placeChanged(null, place)).toBe(false);
  });

  it("другая аудитория после рассылки — изменилось", () => {
    expect(placeChanged(place, { ...place, room: "306" })).toBe(true);
    expect(placeChanged(place, { ...place })).toBe(false);
  });

  it("без места или времени сообщать нельзя", () => {
    expect(placeProblem({ ...place, building: null, room: null })).toMatch(/корпус/);
    expect(placeProblem({ ...place, startsAt: null })).toMatch(/время/);
    expect(placeProblem(place)).toBeNull();
  });

  it("строка места", () => {
    expect(placeLine(place)).toBe("Корпус 2, аудитория 305");
    expect(placeLine({ building: null, room: "Актовый зал" })).toBe("Аудитория Актовый зал");
  });

  it("снимок из JSON", () => {
    expect(readPlace(JSON.parse(JSON.stringify(place)))).toEqual(place);
    expect(readPlace("мусор")).toBeNull();
  });
});
