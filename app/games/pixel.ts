import { shuffled, type Rng } from "./rng";

/**
 * «Угадай по пикселям»: герой Школы открывается из крупных пикселей.
 * Чем раньше угадал (меньше стадий чёткости и быстрее), тем больше очков.
 *
 * Модуль чистый: картинки и варианты — данные, пикселизация — в компоненте
 * на canvas (imageSmoothingEnabled = false).
 */
export interface PixelPuzzle {
  src: string;
  name: string;
}

/** Маскоты и объекты бренда: картинки уже лежат в public/brand. */
export const PUZZLES: PixelPuzzle[] = [
  { src: "/brand/mascots/green.webp", name: "Зелёный маскот" },
  { src: "/brand/mascots/orange.webp", name: "Оранжевый маскот" },
  { src: "/brand/mascots/purple.webp", name: "Фиолетовый маскот" },
  { src: "/brand/mascots/yellow-b.webp", name: "Жёлтый маскот" },
  { src: "/brand/mascots/blue-a.webp", name: "Синий маскот" },
  { src: "/brand/mascots/cyan.webp", name: "Голубой маскот" },
  { src: "/brand/mascots/black-a.webp", name: "Чёрный маскот" },
  { src: "/brand/mascots/orange-angry.webp", name: "Сердитый маскот" },
  { src: "/brand/objects/heart-pixel.webp", name: "Пиксельное сердце" },
  { src: "/brand/objects/star-pixel.webp", name: "Пиксельная звезда" },
  { src: "/brand/objects/asterisk-pixel.webp", name: "Пиксельная звёздочка" },
  { src: "/brand/objects/moon-pixel.webp", name: "Пиксельная луна" },
  { src: "/brand/objects/flame-pixel.webp", name: "Пиксельное пламя" },
  { src: "/brand/objects/smile-pixel.webp", name: "Пиксельный смайлик" },
  { src: "/brand/objects/cursor-pixel.webp", name: "Пиксельный курсор" },
  { src: "/brand/objects/lightning-pixel.webp", name: "Пиксельная молния" },
];

/** Размер блока в пикселях на каждой стадии; 0 — исходник. */
export const STAGE_BLOCKS = [48, 24, 12, 6, 0];

const ROUND_BASE = [500, 400, 300, 200, 100];

export interface PixelRound {
  src: string;
  name: string;
  options: string[];
  correct: number;
}

/** Партия: пять разных загадок, у каждой четыре варианта ответа. */
export function buildParty(rng: Rng, rounds = 5): PixelRound[] {
  return shuffled(PUZZLES, rng)
    .slice(0, rounds)
    .map((puzzle) => {
      const distractors = shuffled(
        PUZZLES.filter((other) => other.name !== puzzle.name),
        rng,
      )
        .slice(0, 3)
        .map((other) => other.name);
      const options = shuffled([puzzle.name, ...distractors], rng);
      return { src: puzzle.src, name: puzzle.name, options, correct: options.indexOf(puzzle.name) };
    });
}

/** Очки раунда: стадия + скорость − ошибки, в минус не уходит. */
export function roundScore(stage: number, seconds: number, wrong: number): number {
  const base = ROUND_BASE[Math.min(Math.max(stage, 0), ROUND_BASE.length - 1)]!;
  return Math.max(0, base + Math.max(0, 30 - Math.floor(seconds)) * 2 - wrong * 50);
}
