import { describe, expect, it } from "vitest";

import { FRAME, type Spot, STICKERS } from "./stickers";

/** Края наклейки в процентах коллажа (по высоте — с учётом формы коллажа). */
function edges(spot: Spot, h: number, frame: number) {
  const height = (spot.w * h) / frame;
  return { left: spot.x - spot.w / 2, right: spot.x + spot.w / 2, top: spot.y - height / 2, bottom: spot.y + height / 2 };
}

describe("раскладка наклеек", () => {
  it("логотип ложится последним и стоит посередине", () => {
    const logo = STICKERS.at(-1)!;
    expect(logo.name).toBe("logo");
    expect(logo.narrow).toMatchObject({ x: 50, y: 50 });
    expect(logo.wide).toMatchObject({ x: 50, y: 50 });
  });

  it("наклейки не повторяются", () => {
    expect(new Set(STICKERS.map((item) => item.name)).size).toBe(STICKERS.length);
  });

  it("на телефоне и на широком экране не вылезают за коллаж больше чем на 4%", () => {
    for (const item of STICKERS) {
      for (const [spot, frame] of [
        [item.narrow, FRAME.narrow],
        [item.wide, FRAME.wide],
      ] as const) {
        if (!spot) continue;
        const box = edges(spot, item.h, frame);
        expect(box.left, item.name).toBeGreaterThanOrEqual(-4);
        expect(box.right, item.name).toBeLessThanOrEqual(104);
        expect(box.top, item.name).toBeGreaterThanOrEqual(-4);
        expect(box.bottom, item.name).toBeLessThanOrEqual(104);
      }
    }
  });
});
