import { describe, expect, it } from "vitest";

import { reviewSummary, validScore } from "./review";

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
