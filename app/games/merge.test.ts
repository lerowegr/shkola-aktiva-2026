import { describe, expect, it } from "vitest";

import { seeded } from "./rng";
import { createMerge, MERGE_SIZE, move, STAGES, valueOf } from "./merge";

describe("«2048»: сдвиги и слияния", () => {
  it("новое поле — две плитки (двойки, изредка четвёрка)", () => {
    const state = createMerge(seeded(1));
    const tiles = state.board.filter(Boolean);
    expect(tiles).toHaveLength(2);
    expect(tiles.every((tile) => [2, 4].includes(valueOf(tile!)))).toBe(true);
  });

  it("две двойки рядом сливаются в четвёрку с очками", () => {
    const state = {
      ...createMerge(seeded(2)),
      board: [
        { id: 1, exp: 1 },
        { id: 2, exp: 1 },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    };
    const result = move(state, "left", seeded(2));
    expect(result.moved).toBe(true);
    expect(valueOf(result.state.board[0]!)).toBe(4);
    expect(result.gained).toBe(4);
    expect(result.state.score).toBe(4);
  });

  it("в пустую сторону ничего не едет, очки не капают", () => {
    const state = {
      ...createMerge(seeded(3)),
      board: [
        { id: 1, exp: 1 },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    };
    const result = move(state, "left", seeded(3));
    expect(result.moved).toBe(false);
    expect(result.gained).toBe(0);
  });

  it("ряд 2-2-4-4 даёт 4 и 8, слившаяся дважды не сливается", () => {
    const board = [
      { id: 1, exp: 1 },
      { id: 2, exp: 1 },
      { id: 3, exp: 2 },
      { id: 4, exp: 2 },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    const state = { ...createMerge(seeded(4)), board };
    const result = move(state, "left", seeded(4));
    expect([valueOf(result.state.board[0]!), valueOf(result.state.board[1]!)]).toEqual([4, 8]);
    expect(result.gained).toBe(12);
  });

  it("слившаяся плитка за тот же ход второй раз не сливается", () => {
    const state = {
      ...createMerge(seeded(6)),
      board: [
        { id: 1, exp: 1 },
        { id: 2, exp: 1 },
        { id: 3, exp: 2 },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    };
    const result = move(state, "left", seeded(6));
    expect([valueOf(result.state.board[0]!), valueOf(result.state.board[1]!)]).toEqual([4, 4]);
    expect(result.gained).toBe(4);
  });

  it("тупик без ходов — партия окончена", () => {
    const board = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2].map((value, index) => ({
      id: index + 1,
      exp: Math.log2(value),
    }));
    const state = { ...createMerge(seeded(5)), board };
    expect(move(state, "left", seeded(5)).moved).toBe(false);
    expect(move(state, "up", seeded(5)).moved).toBe(false);
  });

  it("поле 4×4, ступеней 11 — до логотипа", () => {
    expect(MERGE_SIZE).toBe(4);
    expect(STAGES).toHaveLength(11);
    expect(valueOf({ id: 0, exp: 11 })).toBe(2048);
  });
});
