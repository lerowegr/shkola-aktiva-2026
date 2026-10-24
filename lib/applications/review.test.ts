import { describe, expect, it } from "vitest";

import { allowedScores, reviewSummary, validScore } from "./review";

const criteria = [
  { id: "interest", maxScore: 4 },
  { id: "deadline", maxScore: 2 },
];

describe("reviewSummary", () => {
  it("ни одного балла — новая, итога нет", () => {
    expect(reviewSummary(criteria, [])).toEqual({ total: null, max: 6, status: "new" });
  });

  it("часть баллов — в работе, итог по поставленным", () => {
    expect(reviewSummary(criteria, [{ criterionId: "interest", score: 2 }])).toEqual({
      total: 2,
      max: 6,
      status: "progress",
    });
  });

  it("все баллы — проверена", () => {
    const scores = [
      { criterionId: "interest", score: 3 },
      { criterionId: "deadline", score: 2 },
    ];
    expect(reviewSummary(criteria, scores)).toEqual({ total: 5, max: 6, status: "done" });
  });

  it("баллы по удалённым критериям не считаются", () => {
    const scores = [
      { criterionId: "interest", score: 4 },
      { criterionId: "old", score: 9 },
    ];
    expect(reviewSummary(criteria, scores)).toEqual({ total: 4, max: 6, status: "progress" });
  });

  it("без критериев оценивать нечего — новая", () => {
    expect(reviewSummary([], [])).toEqual({ total: null, max: 0, status: "new" });
  });
});

describe("validScore", () => {
  it("целое от 0 до максимума", () => {
    expect(validScore({ maxScore: 4 }, 0)).toBe(true);
    expect(validScore({ maxScore: 4 }, 4)).toBe(true);
    expect(validScore({ maxScore: 4 }, 5)).toBe(false);
    expect(validScore({ maxScore: 4 }, -1)).toBe(false);
    expect(validScore({ maxScore: 4 }, 1.5)).toBe(false);
  });
});

describe("allowedScores", () => {
  it("расписаны 0 / 2 / 4 — только они, 1 и 3 нельзя", () => {
    const criterion = { maxScore: 4, levels: [{ score: 0, text: "нет" }, { score: 2, text: "частично" }, { score: 4, text: "всё" }] };
    expect(allowedScores(criterion)).toEqual([0, 2, 4]);
    expect(validScore(criterion, 2)).toBe(true);
    expect(validScore(criterion, 3)).toBe(false);
  });

  it("без расшифровок — любой балл от 0 до максимума", () => {
    expect(allowedScores({ maxScore: 2, levels: [] })).toEqual([0, 1, 2]);
    expect(allowedScores({ maxScore: 2 })).toEqual([0, 1, 2]);
  });
});
