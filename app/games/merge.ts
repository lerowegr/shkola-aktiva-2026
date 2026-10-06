import { MERGE_SECONDS } from "~~/lib/games/rules";

import type { Rng } from "./rng";

/**
 * «2048 с маскотами»: сдвиги и слияния на поле 4×4, 11 ступеней —
 * от маскота-двойки до логотипа Школы.
 *
 * Плитки со стабильными id: интерфейс анимирует сдвиги (FLIP), а логика
 * не знает про DOM. Слияние за ход — один раз на плитку, как в оригинале.
 */
export const MERGE_SIZE = 4;
/** Лимит партии в миллисекундах — из правил (lib/games/rules.ts). */
export const MERGE_MS = MERGE_SECONDS * 1000;

export interface MergeTile {
  id: number;
  /** Показатель степени: значение плитки = 2^exp. */
  exp: number;
}

export type MergeBoard = (MergeTile | null)[];

export interface MergeState {
  board: MergeBoard;
  nextId: number;
  score: number;
  timeMs: number;
  over: boolean;
}

export interface MergeMove {
  state: MergeState;
  gained: number;
  moved: boolean;
}

export type MergeDir = "up" | "down" | "left" | "right";

export function valueOf(tile: MergeTile): number {
  return 2 ** tile.exp;
}

/** Картинка ступени: маскоты растут, вершина — стикер-логотип. */
export function stageImage(exp: number): string {
  const faces = [
    "/brand/mascots/green.webp",
    "/brand/mascots/orange.webp",
    "/brand/mascots/purple.webp",
    "/brand/mascots/yellow-b.webp",
    "/brand/mascots/blue-a.webp",
    "/brand/mascots/cyan.webp",
    "/brand/mascots/black-a.webp",
    "/brand/mascots/orange-angry.webp",
    "/brand/mascots/green-angry.webp",
    "/brand/mascots/purple-angry.webp",
    "/brand/logo-sticker.webp",
  ];
  return faces[Math.min(Math.max(exp - 1, 0), faces.length - 1)]!;
}

export const STAGES = Array.from({ length: 11 }, (_, index) => 2 ** (index + 1));

function spawn(board: MergeBoard, nextId: number, rng: Rng): { board: MergeBoard; nextId: number } {
  const empty = board.flatMap((tile, index) => (tile ? [] : [index]));
  if (empty.length === 0) return { board, nextId };
  const at = empty[Math.floor(rng() * empty.length)]!;
  const next = [...board];
  next[at] = { id: nextId, exp: rng() < 0.9 ? 1 : 2 };
  return { board: next, nextId: nextId + 1 };
}

export function createMerge(rng: Rng): MergeState {
  const empty: MergeBoard = new Array(MERGE_SIZE * MERGE_SIZE).fill(null);
  const first = spawn(empty, 1, rng);
  const second = spawn(first.board, first.nextId, rng);
  return { board: second.board, nextId: second.nextId, score: 0, timeMs: 0, over: false };
}

function lines(dir: MergeDir): number[][] {
  const n = MERGE_SIZE;
  const rows = Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => row * n + col));
  if (dir === "left") return rows;
  if (dir === "right") return rows.map((row) => [...row].reverse());
  const cols = Array.from({ length: n }, (_, col) => Array.from({ length: n }, (_, row) => row * n + col));
  if (dir === "up") return cols;
  return cols.map((col) => [...col].reverse());
}

function hasMoves(board: MergeBoard): boolean {
  if (board.some((tile) => !tile)) return true;
  const n = MERGE_SIZE;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const tile = board[row * n + col]!;
      if (col + 1 < n && board[row * n + col + 1]!.exp === tile.exp) return true;
      if (row + 1 < n && board[(row + 1) * n + col]!.exp === tile.exp) return true;
    }
  }
  return false;
}

/** Сдвинуть и слить; после удачного хода появляется новая плитка. */
export function move(state: MergeState, dir: MergeDir, rng: Rng): MergeMove {
  if (state.over) return { state, gained: 0, moved: false };
  const board: MergeBoard = new Array(MERGE_SIZE * MERGE_SIZE).fill(null);
  let gained = 0;
  let moved = false;

  for (const line of lines(dir)) {
    const tiles = line.map((index) => state.board[index]).filter((tile): tile is MergeTile => tile !== null);
    const merged: (MergeTile & { merged: boolean })[] = [];
    for (const tile of tiles) {
      const last = merged[merged.length - 1];
      if (last && last.exp === tile.exp && !last.merged) {
        last.exp += 1;
        last.merged = true;
        gained += valueOf(last);
        moved = true;
      } else {
        merged.push({ ...tile, merged: false });
      }
    }
    line.forEach((index, position) => {
      const tile = merged[position] ?? null;
      if (tile) {
        const { merged: _, ...clean } = tile;
        board[index] = clean;
      } else {
        board[index] = null;
      }
      if (state.board[index]?.id !== board[index]?.id) moved = true;
    });
  }

  if (!moved) return { state, gained: 0, moved: false };
  const spawned = spawn(board, state.nextId, rng);
  const next: MergeState = {
    board: spawned.board,
    nextId: spawned.nextId,
    score: state.score + gained,
    timeMs: state.timeMs,
    over: !hasMoves(spawned.board),
  };
  return { state: next, gained, moved: true };
}

/** Сколько миллисекунд прошло — тикает компонент; лимит — в правилах. */
export function tickTime(state: MergeState, dtMs: number): MergeState {
  if (state.over) return state;
  const timeMs = Math.min(state.timeMs + dtMs, MERGE_MS);
  return { ...state, timeMs, over: timeMs >= MERGE_MS || state.over };
}
