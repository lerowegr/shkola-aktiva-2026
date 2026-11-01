import { describe, expect, it } from "vitest";

import { balance, canChangeAnswer, dayOf, invitesFaculty, assessmentBookingIssue, missedAssessment, attendanceDay, placeChanged, placeLine, placeOf, placeProblem, readPlace } from "./rules";

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

describe("сборы ЦО", () => {
  const now = new Date("2026-10-26T06:00:00Z");

  it("приглашение — своим факультетам, резервный день — всем", () => {
    expect(invitesFaculty({ faculties: ["СНиМК", "МЭО"], reserve: false }, "МЭО")).toBe(true);
    expect(invitesFaculty({ faculties: ["СНиМК", "МЭО"], reserve: false }, "ЮФ")).toBe(false);
    expect(invitesFaculty({ faculties: ["СНиМК"], reserve: false }, null)).toBe(false);
    expect(invitesFaculty({ faculties: [], reserve: true }, null)).toBe(true);
  });

  it("свой день: резервный — резервный сбор, «не смогу» — никакой", () => {
    expect(dayOf({ sessionId: "mon", answer: null }, "sat")).toBeNull();
    expect(dayOf({ sessionId: "mon", answer: "GOING" }, "sat")).toBe("mon");
    expect(dayOf({ sessionId: "mon", answer: "RESERVE" }, "sat")).toBe("sat");
    expect(dayOf({ sessionId: "mon", answer: "RESERVE" }, null)).toBeNull();
    expect(dayOf({ sessionId: "mon", answer: "CANT" }, "sat")).toBeNull();
  });

  it("менять ответ — пока дни не начались", () => {
    expect(canChangeAnswer(now, "2026-10-26T08:00:00Z", "2026-10-31T07:00:00Z")).toBe(true);
    expect(canChangeAnswer(now, "2026-10-26T07:59:59Z")).toBe(false);
    expect(canChangeAnswer(now, "2026-10-26T05:00:00Z")).toBe(false);
    expect(canChangeAnswer(now, null)).toBe(true);
  });

  it("день явки: резерв — день резерва, «не смогу» и очередь — никакой", () => {
    const monday = "2026-10-26T07:00:00Z";
    const saturday = "2026-10-31T07:00:00Z";
    expect(attendanceDay({ sessionStartsAt: monday, answer: "GOING" }, saturday)?.toISOString()).toBe(new Date(monday).toISOString());
    expect(attendanceDay({ sessionStartsAt: monday, answer: "RESERVE" }, saturday)?.toISOString()).toBe(new Date(saturday).toISOString());
    expect(attendanceDay({ sessionStartsAt: monday, answer: "RESERVE" }, null)).toBeNull();
    expect(attendanceDay({ sessionStartsAt: monday, answer: "CANT" }, saturday)).toBeNull();
    expect(attendanceDay({ sessionStartsAt: monday, answer: null }, saturday)).toBeNull();
    expect(attendanceDay({ sessionStartsAt: monday, answer: "RESERVE", reserveQueued: true }, saturday)).toBeNull();
  });

  it("прогул — только у подтвердивших, после своего дня", () => {
    const invite = { sessionStartsAt: "2026-10-26T07:00:00Z", answer: "GOING" as const, attended: false };
    expect(missedAssessment(invite, null, now)).toBe(false);
    expect(missedAssessment({ ...invite, attended: true }, null, now)).toBe(false);
    expect(missedAssessment(invite, null, new Date("2026-10-26T20:59:00Z"))).toBe(false);
    expect(missedAssessment(invite, null, new Date("2026-10-26T21:00:00Z"))).toBe(true);
    expect(missedAssessment({ ...invite, answer: "CANT" }, null, now)).toBe(false);
    expect(missedAssessment({ ...invite, answer: null }, null, now)).toBe(false);
  });
});


describe("нет записи после всех дней ЦО", () => {
  it("полночь Москвы, ручная явка и отсутствие приглашения", () => {
    const invite = { answer: null, attended: false };
    const last = "2026-10-31T14:00:00Z";
    expect(assessmentBookingIssue(invite, last, new Date("2026-10-31T20:59:59Z"))).toBeNull();
    expect(assessmentBookingIssue(invite, last, new Date("2026-10-31T21:00:00Z"))).toBe("not_selected");
    expect(assessmentBookingIssue({ ...invite, attended: true }, last, new Date("2026-11-01T10:00:00Z"))).toBeNull();
    expect(assessmentBookingIssue(null, last)).toBeNull();
    expect(assessmentBookingIssue(invite, null)).toBeNull();
  });
});
