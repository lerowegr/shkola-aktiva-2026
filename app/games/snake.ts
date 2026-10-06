import { SNAKE_SECONDS } from "~~/lib/games/rules";

import type { Rng } from "./rng";

/**
 * «Змейка»: поле 17×17, партия 90 секунд или до смерти.
 *
 * Модуль чистый, как остальные игры: шаг времени накапливается, змея
 * двигается ровными шагами, повороты — очередью (развернуться на 180
 * нельзя). Еда — через Rng: в тестах сид, в игре время.
 */
export const SNAKE_COLS = 17;
export const SNAKE_ROWS = 17;
/** Длина партии в миллисекундах — из правил (lib/games/rules.ts). */
export const SNAKE_MS = SNAKE_SECONDS * 1000;

const BASE_STEP = 140;
const MIN_STEP = 90;

export type SnakeDir = "up" | "down" | "left" | "right";

export interface SnakeState {
  /** Клетки тела от головы к хвосту. */
  body: number[];
  dir: SnakeDir;
  queue: SnakeDir[];
  food: number;
  score: number;
  timeMs: number;
  acc: number;
  alive: boolean;
}

export interface SnakeStep {
  state: SnakeState;
  ate: boolean;
}

const DELTA: Record<SnakeDir, number> = {
  up: -SNAKE_COLS,
  down: SNAKE_COLS,
  left: -1,
  right: 1,
};

const OPPOSITE: Record<SnakeDir, SnakeDir> = { up: "down", down: "up", left: "right", right: "left" };

function freeCell(body: readonly number[], rng: Rng): number {
  const taken = new Set(body);
  const free: number[] = [];
  for (let i = 0; i < SNAKE_COLS * SNAKE_ROWS; i++) if (!taken.has(i)) free.push(i);
  return free[Math.floor(rng() * free.length)] ?? 0;
}

export function snakeStepMs(score: number): number {
  return Math.max(MIN_STEP, BASE_STEP - score * 2);
}

export function createSnake(rng: Rng): SnakeState {
  const middle = Math.floor(SNAKE_ROWS / 2) * SNAKE_COLS + 3;
  const body = [middle + 2, middle + 1, middle];
  return { body, dir: "right", queue: [], food: freeCell(body, rng), score: 0, timeMs: 0, acc: 0, alive: true };
}

/** Повернуть: разворот и повторы игнорируются, очередь не длиннее трёх. */
export function input(state: SnakeState, dir: SnakeDir): SnakeState {
  if (!state.alive) return state;
  const last = state.queue[state.queue.length - 1] ?? state.dir;
  if (dir === last || dir === OPPOSITE[last] || state.queue.length >= 3) return state;
  return { ...state, queue: [...state.queue, dir] };
}

function moveOnce(state: SnakeState, rng: Rng): { state: SnakeState; ate: boolean } {
  const queue = [...state.queue];
  const dir = queue.shift() ?? state.dir;
  const head = state.body[0]!;
  const col = head % SNAKE_COLS;
  // Уход за край по горизонтали — тоже стена, а не перенос на другой край.
  if ((dir === "left" && col === 0) || (dir === "right" && col === SNAKE_COLS - 1)) {
    return { state: { ...state, alive: false }, ate: false };
  }
  const next = head + DELTA[dir]!;
  const eating = next === state.food;
  // Хвост, который сейчас уйдёт, — не препятствие.
  const obstacle = eating ? state.body : state.body.slice(0, -1);
  if (next < 0 || next >= SNAKE_COLS * SNAKE_ROWS || obstacle.includes(next)) {
    return { state: { ...state, alive: false }, ate: false };
  }
  const body = [next, ...state.body];
  if (!eating) body.pop();
  return {
    state: {
      ...state,
      body,
      dir,
      queue,
      food: eating ? freeCell(body, rng) : state.food,
      score: eating ? state.score + 1 : state.score,
    },
    ate: eating,
  };
}

export function step(state: SnakeState, dtMs: number, rng: Rng): SnakeStep {
  if (!state.alive) return { state, ate: false };
  const timeMs = Math.min(state.timeMs + dtMs, SNAKE_MS);
  if (timeMs >= SNAKE_MS) return { state: { ...state, timeMs, alive: false }, ate: false };

  let current: SnakeState = { ...state, timeMs, acc: state.acc + dtMs };
  let ate = false;
  let guard = SNAKE_COLS * SNAKE_ROWS;
  while (current.acc >= snakeStepMs(current.score) && guard-- > 0) {
    current = { ...current, acc: current.acc - snakeStepMs(current.score) };
    const moved = moveOnce(current, rng);
    current = moved.state;
    ate = ate || moved.ate;
    if (!current.alive) break;
  }
  return { state: current, ate };
}
