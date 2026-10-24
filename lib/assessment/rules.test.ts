import { describe, expect, it } from "vitest";

import { balance, canChangeBooking, hasRoom, offeredTo, placeChanged, placeLine, placeOf, placeProblem, readPlace } from "./rules";

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

describe("самозапись на ЦО", () => {
  const now = new Date("2026-10-20T09:00:00Z");
  const group = (extra: Partial<Parameters<typeof offeredTo>[0]> = {}) => ({
    capacity: 20,
    faculties: [] as string[],
    startsAt: "2026-10-22T12:00:00Z",
    taken: 0,
    ...extra,
  });

  it("дату видят только свои факультеты; пустой список — все", () => {
    expect(offeredTo(group(), "МЭО", now)).toBe(true);
    expect(offeredTo(group(), null, now)).toBe(true);
    expect(offeredTo(group({ faculties: ["МЭО", "ЮФ"] }), "ЮФ", now)).toBe(true);
    expect(offeredTo(group({ faculties: ["МЭО"] }), "ФФ", now)).toBe(false);
    expect(offeredTo(group({ faculties: ["МЭО"] }), null, now)).toBe(false);
  });

  it("без мест для записи, без времени и за 2 часа до начала — не предлагается", () => {
    expect(offeredTo(group({ capacity: null }), "МЭО", now)).toBe(false);
    expect(offeredTo(group({ startsAt: null }), "МЭО", now)).toBe(false);
    expect(offeredTo(group({ startsAt: "2026-10-20T10:30:00Z" }), "МЭО", now)).toBe(false);
  });

  it("места и перенос", () => {
    expect(hasRoom(group({ capacity: 2, taken: 1 }))).toBe(true);
    expect(hasRoom(group({ capacity: 2, taken: 2 }))).toBe(false);
    expect(canChangeBooking("2026-10-20T22:00:00Z", now)).toBe(true);
    expect(canChangeBooking("2026-10-20T20:00:00Z", now)).toBe(false);
  });
});
