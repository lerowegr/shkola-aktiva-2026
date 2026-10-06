import { describe, expect, it } from "vitest";

import { seeded } from "./rng";
import { buildParty, PUZZLES, roundScore, STAGE_BLOCKS } from "./pixel";

describe("«Пиксели»: партия", () => {
  it("пять загадок, у каждой четыре разных варианта с верным ответом", () => {
    const party = buildParty(seeded(1));
    expect(party).toHaveLength(5);
    for (const round of party) {
      expect(round.options).toHaveLength(4);
      expect(new Set(round.options).size).toBe(4);
      expect(round.options[round.correct]).toBe(round.name);
    }
    expect(new Set(party.map((round) => round.src)).size).toBe(5);
  });

  it("тот же сид — та же партия", () => {
    expect(buildParty(seeded(7))).toEqual(buildParty(seeded(7)));
  });

  it("стадий чёткости пять, последняя — исходник", () => {
    expect(STAGE_BLOCKS).toHaveLength(5);
    expect(STAGE_BLOCKS[4]).toBe(0);
  });

  it("загадок хватает на партию с запасом", () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(12);
  });
});

describe("«Пиксели»: очки раунда", () => {
  it("сразу и быстро — максимум, поздно и с ошибками — минимум", () => {
    expect(roundScore(0, 5, 0)).toBe(500 + 50);
    expect(roundScore(4, 120, 0)).toBe(100);
  });

  it("ошибки отнимают, в минус не уходит", () => {
    expect(roundScore(2, 10, 1)).toBe(300 + 40 - 50);
    expect(roundScore(4, 120, 10)).toBe(0);
  });
});
