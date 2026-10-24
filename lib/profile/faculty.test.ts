import { describe, expect, it } from "vitest";

import { facultyMatches, NO_FACULTY, parseFacultyFilter } from "./faculty";

describe("фильтр по факультету", () => {
  it("из адреса берёт только известные факультеты", () => {
    expect(parseFacultyFilter("МЭО")).toBe("МЭО");
    expect(parseFacultyFilter("none")).toBe(NO_FACULTY);
    expect(parseFacultyFilter("Хогвартс")).toBe("");
    expect(parseFacultyFilter(undefined)).toBe("");
  });

  it("пустой фильтр — все, «не указан» — только без факультета", () => {
    expect(facultyMatches("МЭО", "")).toBe(true);
    expect(facultyMatches(null, "")).toBe(true);
    expect(facultyMatches("МЭО", "МЭО")).toBe(true);
    expect(facultyMatches("ЮФ", "МЭО")).toBe(false);
    expect(facultyMatches(null, NO_FACULTY)).toBe(true);
    expect(facultyMatches("МЭО", NO_FACULTY)).toBe(false);
  });
});
