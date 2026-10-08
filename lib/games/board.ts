import { db } from "~~/lib/db";
import { Prisma } from "~~/lib/generated/prisma/client";

import { displayName } from "../profile/display";
import { RATED_GAMES, GAMES, isBetter, type GameKind } from "./rules";

/**
 * Публичные таблицы рейтинга: топ игры и общий зачёт.
 *
 * Только кандидаты (как в личном месте): организаторы играют вне рейтинга.
 * Наружу — псевдонимы и аватарки; настоящее имя — только если смотрит staff
 * («админы видят всё», кандидаты друг друга — нет).
 */
export interface BoardRow {
  rank: number;
  name: string;
  avatar: string | null;
  score: number;
  moves: number | null;
  durationMs: number;
  isMe: boolean;
  fullName: string | null;
}

export interface GameBoard {
  game: GameKind;
  rows: BoardRow[];
  players: number;
  me: { rank: number; players: number } | null;
}

interface Best {
  userId: string;
  score: number;
  moves: number | null;
  durationMs: number;
  nickname: string | null;
  seq: number;
  avatarKey: string | null;
  firstName: string | null;
  lastName: string | null;
}

function order(game: GameKind) {
  return GAMES[game].better === "lower"
    ? Prisma.sql`r.score ASC, r."durationMs" ASC`
    : Prisma.sql`r.score DESC, r."durationMs" ASC`;
}

/** Лучший результат каждого кандидата + данные для подписи строки. */
async function gameBests(game: GameKind): Promise<Best[]> {
  return db.$queryRaw<Best[]>`
    SELECT DISTINCT ON (r."userId") r."userId", r.score, r.moves, r."durationMs",
      u.nickname, u.seq, u."avatarKey", u."firstName", u."lastName"
    FROM game_results r
    JOIN users u ON u.id = r."userId"
    WHERE r.game = ${game}::"GameKind" AND u."isOwner" = false AND u.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur."userId" = u.id)
    ORDER BY r."userId", ${order(game)}`;
}

const AVATAR_URL = (key: string | null) => (key ? `/api/avatars/${key}` : null);
const FULL_NAME = (row: Best) => [row.firstName, row.lastName].filter(Boolean).join(" ") || null;

function ranked(game: GameKind, bests: Best[]): (Best & { rank: number })[] {
  return bests.map((row) => ({ ...row, rank: 1 + bests.filter((other) => isBetter(game, other, row)).length }));
}

export async function gameBoard(game: GameKind, meId: string, options: { limit?: number; staff?: boolean } = {}): Promise<GameBoard> {
  const { limit = 20, staff = false } = options;
  const rows = ranked(game, await gameBests(game)).sort((a, b) => a.rank - b.rank);
  const mine = rows.find((row) => row.userId === meId) ?? null;
  const visible = rows.slice(0, limit);
  if (mine && !visible.some((row) => row.userId === meId)) visible.push(mine);
  return {
    game,
    rows: visible.map((row) => ({
      rank: row.rank,
      name: displayName({ nickname: row.nickname, seq: row.seq }),
      avatar: AVATAR_URL(row.avatarKey),
      score: row.score,
      moves: row.moves,
      durationMs: row.durationMs,
      isMe: row.userId === meId,
      fullName: staff ? FULL_NAME(row) : null,
    })),
    players: rows.length,
    me: mine ? { rank: mine.rank, players: rows.length } : null,
  };
}

export interface OverallRow {
  rank: number;
  name: string;
  avatar: string | null;
  points: number;
  played: number;
  isMe: boolean;
  fullName: string | null;
  breakdown: { game: GameKind; rank: number; points: number }[];
}

export interface OverallBoard {
  rows: OverallRow[];
  players: number;
  me: { rank: number; points: number; players: number } | null;
}

/** Ранговые баллы: масштабонезависимы, направление игры неважно. */
export function rankPoints(rank: number, players: number): number {
  if (players <= 0) return 0;
  return Math.round(1000 * (1 - (rank - 1) / players));
}

export interface OverallEntry {
  userId: string;
  points: number;
  played: number;
  breakdown: { game: GameKind; rank: number; points: number }[];
  profile: Best;
  rank: number;
}

export async function overallBoard(meId: string, options: { limit?: number; staff?: boolean } = {}): Promise<OverallBoard> {
  const { limit = 20, staff = false } = options;
  const perGame = await Promise.all(RATED_GAMES.map(async (game) => ({ game, rows: ranked(game, await gameBests(game)) })));

  const totals = new Map<string, { points: number; played: number; breakdown: { game: GameKind; rank: number; points: number }[]; profile: Best }>();
  for (const { game, rows } of perGame) {
    const players = rows.length;
    for (const row of rows) {
      const points = rankPoints(row.rank, players);
      const entry = totals.get(row.userId) ?? { points: 0, played: 0, breakdown: [], profile: row };
      entry.points += points;
      entry.played += 1;
      entry.breakdown.push({ game, rank: row.rank, points });
      totals.set(row.userId, entry);
    }
  }
  const sorted: OverallEntry[] = [...totals.entries()]
    .map(([userId, entry]) => ({ userId, ...entry }))
    .sort((a, b) => b.points - a.points || b.played - a.played || a.profile.seq - b.profile.seq)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const visible = sorted.slice(0, limit);
  const mine = sorted.find((entry) => entry.userId === meId) ?? null;
  if (mine && !visible.some((entry) => entry.userId === meId)) visible.push(mine);

  const toRow = (entry: OverallEntry): OverallRow => ({
    rank: entry.rank,
    name: displayName({ nickname: entry.profile.nickname, seq: entry.profile.seq }),
    avatar: AVATAR_URL(entry.profile.avatarKey),
    points: entry.points,
    played: entry.played,
    isMe: entry.userId === meId,
    fullName: staff ? FULL_NAME(entry.profile) : null,
    breakdown: entry.breakdown,
  });
  const players = sorted.length;
  return {
    rows: visible.map(toRow),
    players,
    me: mine ? { rank: mine.rank, points: mine.points, players } : null,
  };
}
