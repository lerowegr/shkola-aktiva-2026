import { describe, expect, it } from "vitest";

import { seeded } from "./rng";
import { buildRound, questionScore, QUIZ_QUESTIONS, QUIZ_SECONDS_PER_QUESTION } from "./quiz";

describe("«Викторина»: раунд", () => {
  it("десять разных вопросов, у каждого четыре варианта с верным", () => {
    const round = buildRound(seeded(1));
    expect(round).toHaveLength(10);
    expect(new Set(round.map((item) => item.id)).size).toBe(10);
    for (const item of round) {
      expect(item.options).toHaveLength(4);
      expect(item.options[item.correct]).toBe(item.answer);
    }
  });

  it("тот же сид — тот же раунд", () => {
    expect(buildRound(seeded(3))).toEqual(buildRound(seeded(3)));
  });

  it("вопросов в пуле с запасом", () => {
    expect(QUIZ_QUESTIONS.length).toBeGreaterThanOrEqual(12);
  });
});

describe("«Викторина»: очки", () => {
  it("быстрый верный ответ дороже медленного", () => {
    expect(questionScore(QUIZ_SECONDS_PER_QUESTION)).toBe(100 + QUIZ_SECONDS_PER_QUESTION * 10);
    expect(questionScore(0)).toBe(100);
    expect(questionScore(QUIZ_SECONDS_PER_QUESTION)).toBeGreaterThan(questionScore(2));
  });
});
