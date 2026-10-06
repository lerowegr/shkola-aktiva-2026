import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { gameBoard, overallBoard } from "./board";

beforeEach(async () => {
  await resetDatabase();
});

async function candidate(firstName: string): Promise<string> {
  const user = await db.user.create({ data: { firstName } });
  return user.id;
}

async function staffer(): Promise<string> {
  const user = await db.user.create({ data: { firstName: "Мастер" } });
  const role = await db.role.create({ data: { name: "М", slug: "m", permissions: [] } });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user.id;
}

async function play(userId: string, game: "MEMORY" | "CATCH", score: number, durationMs = 10_000) {
  await db.gameResult.create({ data: { userId, game, score, moves: game === "MEMORY" ? score : null, durationMs } });
}

describe("таблица игры", () => {
  it("топ по очкам, своя строка, организаторов нет", async () => {
    const ann = await candidate("Анна");
    const boris = await candidate("Борис");
    const master = await staffer();
    await play(ann, "CATCH", 50);
    await play(boris, "CATCH", 80);
    await play(master, "CATCH", 500);

    const board = await gameBoard("CATCH", ann, { staff: false });
    expect(board.players).toBe(2);
    expect(board.rows.map((row) => row.score)).toEqual([80, 50]);
    expect(board.rows[0]!.rank).toBe(1);
    expect(board.rows[1]).toMatchObject({ rank: 2, isMe: true });
    expect(board.rows[1]!.name).toMatch(/^Игрок /);
    expect(board.rows.every((row) => row.fullName === null)).toBe(true);
    expect(board.me).toMatchObject({ rank: 2, players: 2 });
  });

  it("ник показывается вместо кода, staff видит ФИО", async () => {
    const ann = await candidate("Анна");
    await db.user.update({ where: { id: ann }, data: { nickname: "Звезда", nicknameNorm: "звезда" } });
    await play(ann, "CATCH", 10);
    const plain = await gameBoard("CATCH", ann, { staff: false });
    expect(plain.rows[0]!.name).toBe("Звезда");
    const staff = await gameBoard("CATCH", ann, { staff: true });
    expect(staff.rows[0]!.fullName).toBe("Анна");
  });
});

describe("общий рейтинг", () => {
  it("ранговые баллы суммируются, несыгранное — ноль", async () => {
    const ann = await candidate("Анна");
    const boris = await candidate("Борис");
    const vera = await candidate("Вера");
    await play(ann, "CATCH", 90);
    await play(boris, "CATCH", 60);
    await play(vera, "CATCH", 30);
    await play(ann, "MEMORY", 20);
    await play(boris, "MEMORY", 10);

    const overall = await overallBoard(vera, { staff: false });
    // CATCH: Анна 1000, Борис 667, Вера 333; MEMORY: Борис 1000, Анна 500.
    expect(overall.rows.map((row) => row.points)).toEqual([1667, 1500, 333]);
    expect(overall.players).toBe(3);
    expect(overall.me).toMatchObject({ rank: 3, points: 333 });
  });
});
