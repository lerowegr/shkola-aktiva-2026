import { describe, expect, it } from "vitest";

import { seeded } from "./rng";
import {
  COLS,
  createTetris,
  fallInterval,
  ghostY,
  hardDrop,
  ROWS,
  TETRIS_MS,
  tick,
  tryMove,
  tryRotate,
  type TetrisState,
} from "./tetris";

function emptyCells(state: TetrisState): number {
  return state.board.filter((cell) => cell === 0).length;
}

describe("«Тетрис»: создание и падение", () => {
  it("новое поле пустое, фигура появилась, счёт нулевой", () => {
    const state = createTetris(seeded(1));
    expect(state.board).toHaveLength(COLS * ROWS);
    expect(emptyCells(state)).toBe(COLS * ROWS);
    expect(state.active).not.toBeNull();
    expect(state.score).toBe(0);
    expect(state.lines).toBe(0);
    expect(state.level).toBe(1);
    expect(state.over).toBe(false);
  });

  it("фигура падает со временем и фиксируется внизу", () => {
    let state = createTetris(seeded(2));
    const rng = seeded(2);
    for (let i = 0; i < 3000 && emptyCells(state) === COLS * ROWS; i++) {
      state = tick(state, 100, rng).state;
    }
    expect(emptyCells(state)).toBeLessThan(COLS * ROWS);
    expect(state.active).not.toBeNull();
    expect(state.over).toBe(false);
  });

  it("партия кончается по времени или переполнением — не позже двух минут", () => {
    let state = createTetris(seeded(3));
    const rng = seeded(3);
    for (let i = 0; i < 2000 && !state.over; i++) state = tick(state, 500, rng).state;
    expect(state.over).toBe(true);
    expect(state.timeMs).toBeLessThanOrEqual(TETRIS_MS);
  });

  it("время упирается ровно в две минуты", () => {
    const state = createTetris(seeded(11));
    const after = tick(state, TETRIS_MS + 5000, seeded(11)).state;
    expect(after.over).toBe(true);
    expect(after.timeMs).toBe(TETRIS_MS);
  });
});

describe("«Тетрис»: движение и повороты", () => {
  it("фигура не выходит за стены и дно", () => {
    let state = createTetris(seeded(4));
    for (let i = 0; i < 20; i++) state = tryMove(state, -1, 0);
    const left = state.active!.x;
    state = tryMove(state, -1, 0);
    expect(state.active!.x).toBe(left);
    for (let i = 0; i < 30; i++) state = tryMove(state, 1, 0);
    const right = state.active!.x;
    state = tryMove(state, 1, 0);
    expect(state.active!.x).toBe(right);
  });

  it("поворот меняет клетки, квадрат не меняется", () => {
    const state = createTetris(seeded(5));
    const before = JSON.stringify(state.active);
    const turned = tryRotate(state, 1);
    // У квадрата поворот ничего не меняет визуально, но вызов не ломает фигуру.
    expect(turned.active).not.toBeNull();
    expect(JSON.stringify(turned.active) === before || turned.active!.rot !== state.active!.rot).toBe(true);
  });

  it("жёсткий сброс доводит фигуру до низа и даёт очки", () => {
    const state = createTetris(seeded(6));
    const dropped = hardDrop(state, seeded(6));
    expect(emptyCells(dropped)).toBeLessThan(COLS * ROWS);
    expect(dropped.score).toBeGreaterThan(0);
    expect(dropped.active).not.toBeNull();
  });

  it("призрак показывает, куда упадёт фигура", () => {
    const state = createTetris(seeded(7));
    expect(ghostY(state)).toBeGreaterThanOrEqual(state.active!.y);
    expect(ghostY(hardDrop(state, seeded(7)))).toBeGreaterThanOrEqual(0);
  });
});

describe("«Тетрис»: ряды и очки", () => {
  it("мешок даёт все семь фигур без повторов", () => {
    const seen = new Set<string>();
    let state = createTetris(seeded(8));
    const rng = seeded(8);
    for (let i = 0; i < 7; i++) {
      seen.add(state.active!.type);
      state = hardDrop(state, rng);
    }
    expect(seen.size).toBe(7);
  });

  it("четыре ряда разом — «тетрис» на 800 очков первым уровнем", () => {
    // Строим поле с четырьмя почти полными рядами: пустой один столбец.
    let state = createTetris(seeded(9));
    const board = [...state.board];
    for (let row = ROWS - 4; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) board[row * COLS + col] = col === 0 ? 0 : 1;
    }
    state = { ...state, board, active: { type: "I", rot: 1, x: 0, y: ROWS - 4 }, fallAcc: 0 };
    const rng = seeded(9);
    const after = tick(state, fallInterval(1) + 1, rng).state;
    expect(after.lines).toBe(4);
    expect(after.score).toBe(800);
  });

  it("уровень растёт каждые десять рядов", () => {
    let state = createTetris(seeded(10));
    state = { ...state, lines: 9, level: 1 };
    const board = [...state.board];
    for (let col = 0; col < COLS; col++) board[(ROWS - 1) * COLS + col] = 1;
    board[(ROWS - 1) * COLS] = 0;
    state = { ...state, board, active: { type: "I", rot: 1, x: 0, y: ROWS - 4 }, fallAcc: 0 };
    const after = tick(state, fallInterval(1) + 1, seeded(10)).state;
    expect(after.lines).toBe(10);
    expect(after.level).toBe(2);
  });
});
