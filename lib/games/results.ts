import { db } from "~~/lib/db";
import { Prisma } from "~~/lib/generated/prisma/client";

import { RATED_GAMES, GAMES, implausible, isBetter, type GameKind, type ResultInput } from "./rules";

/**
 * Результаты мини-игр: сохранить партию и узнать своё место.
 *
 * Рейтинг — только среди кандидатов: организаторы играют, чтобы проверить,
 * и не должны отодвигать кандидатов. Чужих имён наружу нет — только место
 * и сколько всего играло.
 */
export interface Best {
  score: number;
  moves: number | null;
  durationMs: number;
}

export interface Standing {
  game: GameKind;
  best: Best | null;
  /** Место среди кандидатов; null — ещё не играл или организатор. */
  rank: number | null;
  players: number;
  plays: number;
}

export type SaveResult = { ok: true; record: boolean } | { ok: false; message: string };

export async function saveResult(userId: string, input: ResultInput, now = new Date()): Promise<SaveResult> {
  const problem = implausible(input);
  if (problem) return { ok: false, message: problem };

  // Две партии не могут закончиться чаще, чем длится одна.
  const last = await db.gameResult.findFirst({
    where: { userId, game: input.game },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && now.getTime() - last.createdAt.getTime() < input.durationMs * 0.9) {
    return { ok: false, message: "Результаты приходят быстрее, чем идёт игра. Сыграйте ещё раз." };
  }

  const before = await ownBest(userId, input.game);
  await db.gameResult.create({
    data: {
      userId,
      game: input.game,
      score: input.score,
      moves: input.moves ?? null,
      durationMs: input.durationMs,
      createdAt: now,
    },
  });
  return { ok: true, record: !before || isBetter(input.game, input, before) };
}

function order(game: GameKind) {
  return GAMES[game].better === "lower"
    ? Prisma.sql`r.score ASC, r."durationMs" ASC`
    : Prisma.sql`r.score DESC, r."durationMs" ASC`;
}

async function ownBest(userId: string, game: GameKind): Promise<Best | null> {
  const [row] = await db.$queryRaw<Best[]>`
    SELECT r.score, r.moves, r."durationMs" FROM game_results r
    WHERE r."userId" = ${userId} AND r.game = ${game}::"GameKind"
    ORDER BY ${order(game)} LIMIT 1`;
  return row ?? null;
}

/** Лучший результат каждого кандидата в игре. */
async function candidateBests(game: GameKind) {
  return db.$queryRaw<(Best & { userId: string })[]>`
    SELECT DISTINCT ON (r."userId") r."userId", r.score, r.moves, r."durationMs"
    FROM game_results r
    JOIN users u ON u.id = r."userId"
    WHERE r.game = ${game}::"GameKind" AND u."isOwner" = false AND u.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur."userId" = u.id)
    ORDER BY r."userId", ${order(game)}`;
}

export async function standing(userId: string, game: GameKind): Promise<Standing> {
  const [bests, best, plays] = await Promise.all([
    candidateBests(game),
    ownBest(userId, game),
    db.gameResult.count({ where: { userId, game } }),
  ]);
  const mine = bests.find((row) => row.userId === userId);
  const rank = mine ? 1 + bests.filter((row) => isBetter(game, row, mine)).length : null;
  return { game, best, rank, players: bests.length, plays };
}

export async function standings(userId: string): Promise<Standing[]> {
  return Promise.all(RATED_GAMES.map((game) => standing(userId, game)));
}

/** Для дашборда: сколько кандидатов играло и сколько партий. */
export async function gamesActivity(): Promise<{ players: number; plays: number }> {
  const candidate = { isOwner: false, roles: { none: {} } };
  const [players, plays] = await Promise.all([
    db.user.count({ where: { ...candidate, gameResults: { some: {} } } }),
    db.gameResult.count({ where: { user: candidate } }),
  ]);
  return { players, plays };
}
