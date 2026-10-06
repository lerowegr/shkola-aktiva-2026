import { TETRIS_SECONDS } from "~~/lib/games/rules";

import { shuffled, type Rng } from "./rng";

/**
 * «Тетрис»: стакан 10×20, семь фигур, партия две минуты.
 *
 * Модуль чистый, как остальные игры: состояние возвращается новым, случайность
 * только через Rng (в тестах — сид, в игре — время). Время игровое: тики идут,
 * только пока компонент вызывает tick, поэтому спрятанная вкладка — пауза.
 */
export const COLS = 10;
export const ROWS = 20;
/** Длина партии в миллисекундах — из правил (lib/games/rules.ts). */
export const TETRIS_MS = TETRIS_SECONDS * 1000;

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export const PIECE_TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

type Cell = readonly [number, number];

const BASE: Record<PieceType, Cell[]> = {
  I: [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  O: [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
  ],
  T: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  J: [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  L: [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
};

/** Клетки фигуры после поворота: крутим в квадрате 4×4 и сдвигаем к нулю. */
export function cellsOf(type: PieceType, rot: number): Cell[] {
  let cells = BASE[type];
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) {
    cells = cells.map(([x, y]) => [3 - y, x]);
  }
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

export interface Active {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
}

export interface TetrisState {
  /** Стакан построчно: 0 — пусто, иначе номер фигуры (1…7). */
  board: number[];
  active: Active | null;
  bag: PieceType[];
  score: number;
  lines: number;
  level: number;
  timeMs: number;
  fallAcc: number;
  over: boolean;
}

export interface TickResult {
  state: TetrisState;
  locked: boolean;
  cleared: number;
}

const KICKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
];

const LINE_POINTS = [0, 100, 300, 500, 800];

/** Интервал падения в миллисекундах: выше уровень — быстрее. */
export function fallInterval(level: number): number {
  return Math.max(60, Math.round(800 * Math.pow(0.85, level - 1)));
}

export function levelFor(lines: number): number {
  return Math.floor(lines / 10) + 1;
}

function fits(board: number[], type: PieceType, rot: number, x: number, y: number): boolean {
  return cellsOf(type, rot).every(([dx, dy]) => {
    const col = x + dx;
    const row = y + dy;
    return col >= 0 && col < COLS && row >= 0 && row < ROWS && board[row * COLS + col] === 0;
  });
}

function takeFromBag(bag: PieceType[], rng: Rng): { bag: PieceType[]; type: PieceType } {
  const full = bag.length === 0 ? shuffled(PIECE_TYPES, rng) : [...bag];
  return { bag: full.slice(1), type: full[0]! };
}

/** Поставить следующую фигуру; не влезла — партия окончена. */
function spawn(state: TetrisState, rng: Rng): TetrisState {
  const { bag, type } = takeFromBag(state.bag, rng);
  const active: Active = { type, rot: 0, x: 3, y: 0 };
  if (!fits(state.board, type, 0, active.x, active.y)) {
    return { ...state, bag, active: null, over: true };
  }
  return { ...state, bag, active, fallAcc: 0 };
}

export function createTetris(rng: Rng): TetrisState {
  return spawn(
    {
      board: new Array(COLS * ROWS).fill(0),
      active: null,
      bag: [],
      score: 0,
      lines: 0,
      level: 1,
      timeMs: 0,
      fallAcc: 0,
      over: false,
    },
    rng,
  );
}

/** Сдвинуть фигуру; стена или куча — стоим на месте. */
export function tryMove(state: TetrisState, dx: number, dy: number): TetrisState {
  const { active } = state;
  if (state.over || !active) return state;
  if (!fits(state.board, active.type, active.rot, active.x + dx, active.y + dy)) return state;
  return { ...state, active: { ...active, x: active.x + dx, y: active.y + dy } };
}

/** Повернуть фигуру; рядом стена — пробуем подножки. */
export function tryRotate(state: TetrisState, dir: 1 | -1): TetrisState {
  const { active } = state;
  if (state.over || !active) return state;
  const rot = (((active.rot + dir) % 4) + 4) % 4;
  for (const [kx, ky] of KICKS) {
    if (fits(state.board, active.type, rot, active.x + kx, active.y + ky)) {
      return { ...state, active: { ...active, rot, x: active.x + kx, y: active.y + ky } };
    }
  }
  return state;
}

function lock(state: TetrisState, rng: Rng): { state: TetrisState; cleared: number } {
  const { active } = state;
  if (!active) return { state, cleared: 0 };
  const board = [...state.board];
  const value = PIECE_TYPES.indexOf(active.type) + 1;
  for (const [dx, dy] of cellsOf(active.type, active.rot)) {
    const row = active.y + dy;
    const col = active.x + dx;
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) board[row * COLS + col] = value;
  }
  let cleared = 0;
  // Собираем несгоревшие ряды заново.
  const rows: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const line = board.slice(row * COLS, row * COLS + COLS);
    if (line.every((cell) => cell !== 0)) cleared++;
    else rows.push(line);
  }
  while (rows.length < ROWS) rows.unshift(new Array(COLS).fill(0));
  const lines = state.lines + cleared;
  const scored = { ...state, board: rows.flat(), lines, level: levelFor(lines) };
  scored.score = state.score + LINE_POINTS[Math.min(cleared, 4)]! * state.level;
  return { state: spawn(scored, rng), cleared };
}

/** Мгновенно уронить фигуру: +2 очка за клетку. */
export function hardDrop(state: TetrisState, rng: Rng): TetrisState {
  if (state.over || !state.active) return state;
  const dist = ghostY(state) - state.active.y;
  const { state: locked } = lock({ ...state, active: { ...state.active, y: ghostY(state) } }, rng);
  return { ...locked, score: locked.score + dist * 2 };
}

/** На сколько рядов вниз фигура долетит сама. */
export function ghostY(state: TetrisState): number {
  const { active } = state;
  if (!active) return 0;
  let y = active.y;
  while (fits(state.board, active.type, active.rot, active.x, y + 1)) y++;
  return y;
}

/**
 * Один шаг времени: dtMs — миллисекунд, soft — держать «вниз» (+1 за клетку).
 * Падение ускоряется с уровнем; сгоревшие ряды возвращаем для эффектов.
 */
export function tick(state: TetrisState, dtMs: number, rng: Rng, soft = false): TickResult {
  if (state.over || !state.active) return { state, locked: false, cleared: 0 };
  const timeMs = Math.min(state.timeMs + dtMs, TETRIS_MS);
  if (timeMs >= TETRIS_MS) return { state: { ...state, timeMs, over: true }, locked: false, cleared: 0 };

  let current: TetrisState = { ...state, timeMs, fallAcc: state.fallAcc + dtMs * (soft ? 20 : 1) };
  let locked = false;
  let cleared = 0;
  let guard = ROWS + 2;
  while (current.fallAcc >= fallInterval(current.level) && guard-- > 0) {
    current = { ...current, fallAcc: current.fallAcc - fallInterval(current.level) };
    const { active } = current;
    if (!active) break;
    if (fits(current.board, active.type, active.rot, active.x, active.y + 1)) {
      current = { ...current, active: { ...active, y: active.y + 1 }, score: current.score + (soft ? 1 : 0) };
    } else {
      const result = lock(current, rng);
      current = result.state;
      cleared = result.cleared;
      locked = true;
      if (current.over) break;
    }
  }
  return { state: current, locked, cleared };
}
