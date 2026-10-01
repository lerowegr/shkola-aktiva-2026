import { describe, expect, it } from "vitest";

import { DELIVERY_DELAY_MS, deliveryTime } from "./schedule";

// Москва — UTC+3 круглый год.
const msk = (iso: string) => new Date(`${iso}+03:00`);

describe("deliveryTime", () => {
  it("днём — через минуту", () => {
    const now = msk("2026-10-05T14:00:00");
    expect(deliveryTime(now, { urgent: false }).getTime()).toBe(now.getTime() + DELIVERY_DELAY_MS);
  });

  it("поздним вечером — в 08:00 следующего утра", () => {
    expect(deliveryTime(msk("2026-10-05T23:30:00"), { urgent: false })).toEqual(msk("2026-10-06T08:00:00"));
  });

  it("глубокой ночью — в 08:00 того же утра", () => {
    expect(deliveryTime(msk("2026-10-06T03:00:00"), { urgent: false })).toEqual(msk("2026-10-06T08:00:00"));
  });

  it("если минута задержки перешла за 23:00 — тоже утром", () => {
    expect(deliveryTime(msk("2026-10-05T22:59:30"), { urgent: false })).toEqual(msk("2026-10-06T08:00:00"));
  });

  it("срочное — через минуту даже ночью", () => {
    const now = msk("2026-10-06T03:00:00");
    expect(deliveryTime(now, { urgent: true }).getTime()).toBe(now.getTime() + DELIVERY_DELAY_MS);
  });
});
