import { describe, expect, it } from "vitest";

import { CATCH_SECONDS } from "~~/lib/games/rules";

import { createCatch, PLAYER_Y, stepCatch, type CatchState } from "./catch";
import { createMemory, flip, memoryDone, settle } from "./memory";
import { seeded } from "./rng";
import { isSolved, shuffleBoard, slide, slideByKey, solvedBoard } from "./slide";

describe("«Пары»", () => {
  const faces = ["a", "b", "c"];
  const indexOf = (state: ReturnType<typeof createMemory>, face: string) =>
    state.cards.flatMap((card, index) => (card.face === face ? [index] : []));

  it("пара совпала — ход засчитан, карточки остаются открытыми", () => {
    const state = createMemory(faces, seeded(1));
    const [first, second] = indexOf(state, "a");
    const opened = flip(state, first!).state;
    const result = flip(opened, second!);
    expect(result.event).toBe("match");
    expect(result.state.moves).toBe(1);
    expect(result.state.cards.filter((card) => card.matched)).toHaveLength(2);
  });

  it("не совпали — ход засчитан, третья карточка закрывает пару", () => {
    let state = createMemory(faces, seeded(2));
    state = flip(state, indexOf(state, "a")[0]!).state;
    const miss = flip(state, indexOf(state, "b")[0]!);
    expect(miss.event).toBe("miss");
    expect(miss.state.open).toHaveLength(2);
    const third = flip(miss.state, indexOf(state, "c")[0]!);
    expect(third.state.open).toEqual([indexOf(state, "c")[0]]);
    expect(settle(miss.state).open).toEqual([]);
  });

  it("после промаха нажатие на открытую карточку начинает с неё новую попытку", () => {
    let state = createMemory(faces, seeded(4));
    const a = indexOf(state, "a");
    state = flip(state, a[0]!).state;
    state = flip(state, indexOf(state, "b")[0]!).state;
    const again = flip(state, a[0]!);
    expect(again.event).toBe("open");
    expect(again.state.open).toEqual([a[0]]);
    expect(flip(again.state, a[1]!).event).toBe("match");
  });

  it("открытую или угаданную карточку второй раз не открыть; игра кончается на последней паре", () => {
    let state = createMemory(faces, seeded(3));
    for (const face of faces) {
      const [a, b] = indexOf(state, face);
      state = flip(state, a!).state;
      expect(flip(state, a!).event).toBe("ignored");
      state = flip(state, b!).state;
    }
    expect(memoryDone(state)).toBe(true);
    expect(state.moves).toBe(3);
  });
});

describe("«Пятнашки»", () => {
  it("двигается только плитка рядом с пустым местом", () => {
    const board = solvedBoard(3); // пусто в правом нижнем углу (8)
    expect(slide(board, 3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8]);
    expect(slide(board, 3, 0)).toBeNull();
  });

  it("стрелка двигает плитку в свою сторону", () => {
    const board = solvedBoard(3);
    expect(slideByKey(board, 3, "right")).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8]);
    expect(slideByKey(board, 3, "down")).toEqual([1, 2, 3, 4, 5, 0, 7, 8, 6]);
    expect(slideByKey(board, 3, "up")).toBeNull();
  });

  it("перемешанное поле не собрано и собирается обратными ходами", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const board = shuffleBoard(3, seeded(seed));
      expect(isSolved(board)).toBe(false);
      expect([...board].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });
});

describe("«Лови»", () => {
  it("партия длится ровно положенное время и заканчивается", () => {
    let state = createCatch();
    const rng = seeded(4);
    for (let i = 0; i < 2000 && !state.over; i++) state = stepCatch(state, 1 / 30, 0.5, rng).state;
    expect(state.over).toBe(true);
    expect(state.time).toBe(CATCH_SECONDS);
  });

  it("объект над маскотом ловится и даёт очки, мимо — нет", () => {
    const base: CatchState = { ...createCatch(), nextSpawn: 99, player: 0.5 };
    const hit = stepCatch(
      { ...base, items: [{ id: 1, kind: "star", x: 0.5, y: PLAYER_Y, speed: 0, spin: 0 }] },
      0.01,
      0.5,
      seeded(5),
    );
    expect(hit.events).toEqual(["star"]);
    expect(hit.state.score).toBe(3);

    const miss = stepCatch(
      { ...base, items: [{ id: 1, kind: "bolt", x: 0.95, y: PLAYER_Y, speed: 0, spin: 0 }] },
      0.01,
      0.5,
      seeded(5),
    );
    expect(miss.events).toEqual([]);
  });

  it("маскот догоняет цель с ограниченной скоростью и не выходит за край", () => {
    const state = stepCatch({ ...createCatch(), nextSpawn: 99 }, 0.1, 1, seeded(6)).state;
    expect(state.player).toBeCloseTo(0.74);
    let far = state;
    for (let i = 0; i < 20; i++) far = stepCatch(far, 0.1, 5, seeded(6)).state;
    expect(far.player).toBeCloseTo(0.9);
  });

  it("за партию набрать больше предела сервера нельзя, даже ловя только звёзды", () => {
    let state = createCatch();
    const rng = seeded(7);
    let spawned = 0;
    while (!state.over) {
      const next = stepCatch(state, 1 / 30, 0.5, rng).state;
      spawned += Math.max(0, next.nextId - state.nextId);
      state = next;
    }
    expect(spawned * 3).toBeLessThanOrEqual(300);
  });
});
