import { describe, expect, it } from "vitest";

import { seeded } from "./rng";
import { createSnake, input, SNAKE_COLS, SNAKE_ROWS, step, type SnakeState } from "./snake";
import { SNAKE_SECONDS } from "~~/lib/games/rules";

function run(state: SnakeState, ms: number, seed = 1): SnakeState {
  const rng = seeded(seed);
  let current = state;
  for (let i = 0; i < ms / 50 && current.alive; i++) current = step(current, 50, rng).state;
  return current;
}

/** Жадное подруливание к еде — как игрок, который видит поле. */
function graze(state: SnakeState, ms: number, seed = 1): SnakeState {
  const rng = seeded(seed);
  let current = state;
  for (let i = 0; i < ms / 50 && current.alive; i++) {
    const head = current.body[0]!;
    const dx = (current.food % SNAKE_COLS) - (head % SNAKE_COLS);
    const dy = Math.floor(current.food / SNAKE_COLS) - Math.floor(head / SNAKE_COLS);
    current = input(current, Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    current = step(current, 50, rng).state;
  }
  return current;
}

describe("«Змейка»: создание и движение", () => {
  it("новая змейка жива, еда не под телом", () => {
    const state = createSnake(seeded(1));
    expect(state.alive).toBe(true);
    expect(state.score).toBe(0);
    expect(state.body.length).toBe(3);
    expect(state.body).not.toContain(state.food);
  });

  it("змейка ползёт и со временем съедает хоть что-то", () => {
    const grown = graze(createSnake(seeded(2)), 60_000, 2);
    expect(grown.score).toBeGreaterThan(0);
    expect(grown.body.length).toBeGreaterThan(3);
  });

  it("партия кончается по времени или смертью — не позже лимита", () => {
    const state = run(createSnake(seeded(3)), (SNAKE_SECONDS + 10) * 1000, 3);
    expect(state.timeMs).toBeLessThanOrEqual(SNAKE_SECONDS * 1000);
    expect(state.alive === false || state.timeMs === SNAKE_SECONDS * 1000).toBe(true);
  });
});

describe("«Змейка»: управление и смерть", () => {
  it("развернуться на 180 нельзя", () => {
    const state = createSnake(seeded(4));
    const turned = input(state, "left");
    // Змейка изначально ползёт вправо: «влево» игнорируется.
    expect(turned.queue).toHaveLength(0);
    expect(input(state, "up").queue).toEqual(["up"]);
  });

  it("стена убивает", () => {
    let state = createSnake(seeded(5));
    // Влево от старта — стена уже через несколько шагов.
    state = input(state, "up");
    state = input(state, "left");
    state = run(state, 20_000, 5);
    expect(state.alive).toBe(false);
  });

  it("поле 17×17", () => {
    expect(SNAKE_COLS).toBe(17);
    expect(SNAKE_ROWS).toBe(17);
  });
});
