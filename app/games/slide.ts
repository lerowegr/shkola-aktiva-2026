import type { Rng } from "./rng";

/**
 * «Пятнашки» n×n: плитки 1…n²−1 и пустое место 0. Собрано — плитки по
 * порядку, пустое место в конце. Перемешиваем случайными ходами от
 * собранного поля — так поле всегда можно собрать.
 */
export type Board = readonly number[];
export type Direction = "up" | "down" | "left" | "right";

export function solvedBoard(n: number): number[] {
  return [...Array.from({ length: n * n - 1 }, (_, i) => i + 1), 0];
}

export function isSolved(board: Board): boolean {
  return board.every((tile, index) => tile === (index === board.length - 1 ? 0 : index + 1));
}

function neighbors(n: number, index: number): number[] {
  const row = Math.floor(index / n);
  const col = index % n;
  return [
    row > 0 ? index - n : -1,
    row < n - 1 ? index + n : -1,
    col > 0 ? index - 1 : -1,
    col < n - 1 ? index + 1 : -1,
  ].filter((value) => value >= 0);
}

/** Сдвинуть плитку с позиции index на пустое место, если оно рядом. */
export function slide(board: Board, n: number, index: number): number[] | null {
  const empty = board.indexOf(0);
  if (!neighbors(n, empty).includes(index)) return null;
  const next = [...board];
  next[empty] = next[index]!;
  next[index] = 0;
  return next;
}

/**
 * Стрелка двигает плитку в эту сторону: «вверх» — плитка под пустым местом
 * поднимается в него.
 */
export function slideByKey(board: Board, n: number, direction: Direction): number[] | null {
  const empty = board.indexOf(0);
  const row = Math.floor(empty / n);
  const col = empty % n;
  const from = {
    up: row < n - 1 ? empty + n : -1,
    down: row > 0 ? empty - n : -1,
    left: col < n - 1 ? empty + 1 : -1,
    right: col > 0 ? empty - 1 : -1,
  }[direction];
  return from >= 0 ? slide(board, n, from) : null;
}

export function shuffleBoard(n: number, rng: Rng, steps = 160): number[] {
  let board = solvedBoard(n);
  let previous = -1;
  for (let step = 0; step < steps || isSolved(board); step++) {
    const empty = board.indexOf(0);
    // Не возвращаем плитку туда, откуда она только что пришла.
    const options = neighbors(n, empty).filter((index) => index !== previous);
    const pick = options[Math.floor(rng() * options.length)]!;
    board = slide(board, n, pick)!;
    previous = empty;
  }
  return board;
}
