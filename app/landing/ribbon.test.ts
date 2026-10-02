import { describe, expect, it } from "vitest";

import { copiesNeeded, cruise, decay, isDrag, RESUME_AFTER, wrap } from "./ribbon";

describe("wrap", () => {
  it("держит смещение в [0, period)", () => {
    expect(wrap(0, 300)).toBe(0);
    expect(wrap(299, 300)).toBe(299);
    expect(wrap(300, 300)).toBe(0);
    expect(wrap(950, 300)).toBe(50);
  });

  it("заворачивает и отрицательные: лента бесконечна в обе стороны", () => {
    expect(wrap(-1, 300)).toBe(299);
    expect(wrap(-650, 300)).toBe(250);
  });

  it("без ширины копии — ноль, а не NaN", () => {
    expect(wrap(120, 0)).toBe(0);
  });
});

describe("isDrag", () => {
  it("короткое движение — нажатие", () => {
    expect(isDrag(3, 1)).toBe(false);
    expect(isDrag(-5, 0)).toBe(false);
  });

  it("от 6 px по горизонтали — перетаскивание в обе стороны", () => {
    expect(isDrag(6, 2)).toBe(true);
    expect(isDrag(-20, 5)).toBe(true);
  });

  it("вертикальный жест — прокрутка страницы, а не лента", () => {
    expect(isDrag(8, 30)).toBe(false);
  });
});

describe("decay", () => {
  it("инерция затухает и останавливается", () => {
    let velocity = 1200;
    const seen = [velocity];
    for (let frame = 0; frame < 240; frame++) {
      velocity = decay(velocity, 1 / 60);
      seen.push(velocity);
    }
    expect(seen[30]!).toBeLessThan(seen[0]!);
    expect(Math.abs(seen[60]!)).toBeLessThan(100);
    expect(velocity).toBe(0);
  });

  it("в обе стороны одинаково", () => {
    expect(decay(-500, 0.1)).toBeCloseTo(-decay(500, 0.1));
  });
});

describe("cruise", () => {
  it("стоит, пока не прошло 4 секунды без касаний", () => {
    expect(RESUME_AFTER).toBe(4000);
    expect(cruise(0, 40)).toBe(0);
    expect(cruise(3999, 40)).toBe(0);
  });

  it("потом плавно разгоняется до хода", () => {
    const half = cruise(RESUME_AFTER + 500, 40);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(40);
    expect(cruise(RESUME_AFTER + 1000, 40)).toBe(40);
    expect(cruise(60_000, 40)).toBe(40);
  });
});

describe("copiesNeeded", () => {
  it("минимум две копии", () => {
    expect(copiesNeeded(3000, 1280)).toBe(2);
  });

  it("узкая копия на широком экране — столько, чтобы закрыть экран со сдвигом", () => {
    const copies = copiesNeeded(800, 1920);
    expect((copies - 1) * 800).toBeGreaterThanOrEqual(1920);
  });

  it("без размеров — две", () => {
    expect(copiesNeeded(0, 1280)).toBe(2);
  });
});
