/**
 * Мини-игры: названия, что считается лучше и где кончается правдоподобие.
 *
 * Модуль чистый — им пользуются и сервер (проверка и рейтинг), и страницы
 * (подписи и формат результата). Тип игры — строкой, как в базе, без
 * импорта Prisma: модуль должен собираться в браузерный код.
 */
export type GameKind = "MEMORY" | "SLIDE" | "CATCH";
export const GAME_KINDS: GameKind[] = ["MEMORY", "SLIDE", "CATCH"];

export interface GameRules {
  slug: string;
  title: string;
  /** Одна строка в карточке игры. */
  about: string;
  /** Что лучше: меньше ходов и времени или больше очков. */
  better: "lower" | "higher";
  score: { min: number; max: number };
  moves: { min: number; max: number } | null;
  duration: { min: number; max: number };
}

/** Длина партии «Лови» — правила игры (app/games/catch.ts) берут её отсюда. */
export const CATCH_SECONDS = 45;

export const GAMES: Record<GameKind, GameRules> = {
  MEMORY: {
    slug: "memory",
    title: "Пары",
    about: "Найдите пары маскотов за меньшее число ходов.",
    better: "lower",
    // Восемь пар: меньше восьми ходов не бывает.
    score: { min: 8, max: 400 },
    moves: { min: 8, max: 400 },
    duration: { min: 4_000, max: 60 * 60 * 1000 },
  },
  SLIDE: {
    slug: "puzzle",
    title: "Пятнашки",
    about: "Соберите стикер-логотип Школы из перемешанных кусочков.",
    better: "lower",
    // Здесь главный показатель — время сборки в миллисекундах.
    score: { min: 2_000, max: 60 * 60 * 1000 },
    moves: { min: 2, max: 5_000 },
    duration: { min: 2_000, max: 60 * 60 * 1000 },
  },
  CATCH: {
    slug: "catch",
    title: "Лови",
    about: "Ловите стеклянные объекты и уворачивайтесь от тёмных молний.",
    better: "higher",
    // Объектов за партию падает меньше сотни, звёздочка — самая дорогая (+3).
    score: { min: -500, max: 300 },
    moves: null,
    duration: { min: CATCH_SECONDS * 1000 - 1_000, max: CATCH_SECONDS * 1000 + 1_000 },
  },
};

export function gameBySlug(slug: string): GameKind | null {
  return GAME_KINDS.find((kind) => GAMES[kind].slug === slug) ?? null;
}

export interface ResultInput {
  game: GameKind;
  score: number;
  moves?: number | null;
  durationMs: number;
}

/** Правдоподобен ли результат. Ответ — причина отказа или null. */
export function implausible(input: ResultInput): string | null {
  const rules = GAMES[input.game];
  const within = (value: number, range: { min: number; max: number }) =>
    Number.isInteger(value) && value >= range.min && value <= range.max;

  if (!within(input.score, rules.score) || !within(input.durationMs, rules.duration)) {
    return "Такой результат получиться не мог. Сыграйте ещё раз.";
  }
  if (rules.moves && (input.moves == null || !within(input.moves, rules.moves))) {
    return "Такой результат получиться не мог. Сыграйте ещё раз.";
  }
  if (input.game === "SLIDE" && input.score !== input.durationMs) {
    return "Такой результат получиться не мог. Сыграйте ещё раз.";
  }
  return null;
}

/** Лучше ли результат a, чем b. Равные очки решает время. */
export function isBetter(
  game: GameKind,
  a: { score: number; durationMs: number },
  b: { score: number; durationMs: number },
): boolean {
  if (a.score !== b.score) return GAMES[game].better === "lower" ? a.score < b.score : a.score > b.score;
  return a.durationMs < b.durationMs;
}

/** «1:05» — минуты и секунды. */
export function clock(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Результат человеческими словами: «12 ходов, 0:41», «0:37, 24 хода», «57 очков». */
export function describeResult(game: GameKind, result: { score: number; moves: number | null; durationMs: number }): string {
  const moves = (n: number) => `${n} ${plural(n, ["ход", "хода", "ходов"])}`;
  if (game === "MEMORY") return `${moves(result.score)}, ${clock(result.durationMs)}`;
  if (game === "SLIDE") return result.moves != null ? `${clock(result.durationMs)}, ${moves(result.moves)}` : clock(result.durationMs);
  return `${result.score} ${plural(Math.abs(result.score), ["очко", "очка", "очков"])}`;
}
