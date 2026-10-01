import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { gamesActivity, saveResult, standing } from "./results";
import { describeResult, implausible } from "./rules";

beforeEach(resetDatabase);

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 10, 12, 0, seconds));

describe("правдоподобие", () => {
  it("отсекает невозможное", () => {
    expect(implausible({ game: "MEMORY", score: 5, moves: 5, durationMs: 30_000 })).not.toBeNull(); // меньше 8 ходов
    expect(implausible({ game: "CATCH", score: 9000, durationMs: 45_000 })).not.toBeNull();
    expect(implausible({ game: "CATCH", score: 40, durationMs: 10_000 })).not.toBeNull(); // партия идёт 45 секунд
    expect(implausible({ game: "SLIDE", score: 30_000, moves: 20, durationMs: 31_000 })).not.toBeNull(); // время ≠ очки
    expect(implausible({ game: "MEMORY", score: 12, moves: 12, durationMs: 41_000 })).toBeNull();
  });

  it("говорит результат словами", () => {
    expect(describeResult("MEMORY", { score: 12, moves: 12, durationMs: 41_000 })).toBe("12 ходов, 0:41");
    expect(describeResult("SLIDE", { score: 65_000, moves: 22, durationMs: 65_000 })).toBe("1:05, 22 хода");
    expect(describeResult("CATCH", { score: 51, moves: null, durationMs: 45_000 })).toBe("51 очко");
  });
});

describe("результаты", () => {
  it("партии не чаще, чем длится игра", async () => {
    const user = await db.user.create({ data: {} });
    const play = { game: "CATCH" as const, score: 30, durationMs: 45_000 };
    expect(await saveResult(user.id, play, at(0))).toEqual({ ok: true, record: true });
    expect((await saveResult(user.id, play, at(10))).ok).toBe(false);
    expect((await saveResult(user.id, play, at(50))).ok).toBe(true);
  });

  it("рекорд — только когда лучше прежнего; меньше ходов лучше", async () => {
    const user = await db.user.create({ data: {} });
    await saveResult(user.id, { game: "MEMORY", score: 14, moves: 14, durationMs: 40_000 }, at(0));
    expect(await saveResult(user.id, { game: "MEMORY", score: 16, moves: 16, durationMs: 30_000 }, at(100))).toEqual({
      ok: true,
      record: false,
    });
    expect(await saveResult(user.id, { game: "MEMORY", score: 14, moves: 14, durationMs: 35_000 }, at(200))).toEqual({
      ok: true,
      record: true,
    });
    const mine = await standing(user.id, "MEMORY");
    expect(mine.best).toEqual({ score: 14, moves: 14, durationMs: 35_000 });
    expect(mine.plays).toBe(3);
  });

  it("место — по лучшему результату каждого кандидата; организаторы не в рейтинге", async () => {
    const [anna, boris, vera] = await Promise.all([1, 2, 3].map(() => db.user.create({ data: {} })));
    const role = await db.role.create({ data: { name: "М", slug: "m", permissions: [] } });
    const master = await db.user.create({ data: { roles: { create: { roleId: role.id } } } });

    await saveResult(anna!.id, { game: "CATCH", score: 40, durationMs: 45_000 }, at(0));
    await saveResult(anna!.id, { game: "CATCH", score: 10, durationMs: 45_000 }, at(60)); // хуже — не в счёт
    await saveResult(boris!.id, { game: "CATCH", score: 55, durationMs: 45_000 }, at(0));
    await saveResult(vera!.id, { game: "CATCH", score: 20, durationMs: 45_000 }, at(0));
    await saveResult(master.id, { game: "CATCH", score: 99, durationMs: 45_000 }, at(0));

    expect(await standing(anna!.id, "CATCH")).toMatchObject({ rank: 2, players: 3, plays: 2, best: { score: 40 } });
    expect(await standing(boris!.id, "CATCH")).toMatchObject({ rank: 1, players: 3 });
    expect(await standing(master.id, "CATCH")).toMatchObject({ rank: null, players: 3, best: { score: 99 } });
    expect(await gamesActivity()).toEqual({ players: 3, plays: 4 });
  });
});
