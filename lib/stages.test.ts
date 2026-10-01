import { describe, expect, it } from "vitest";

import { stageState } from "./stages";

const at = (iso: string) => new Date(iso);
const opens = at("2026-11-01T09:00:00Z");
const closes = at("2026-11-15T21:00:00Z");

describe("stageState", () => {
  it("ручное решение побеждает даты", () => {
    expect(stageState({ mode: "OPEN", opensAt: opens, closesAt: closes }, at("2020-01-01T00:00:00Z"))).toBe("open");
    expect(stageState({ mode: "CLOSED", opensAt: opens, closesAt: closes }, at("2026-11-05T00:00:00Z"))).toBe("closed");
  });

  it("без даты открытия этап ещё впереди", () => {
    expect(stageState({ mode: "AUTO", opensAt: null, closesAt: closes }, at("2026-12-01T00:00:00Z"))).toBe("upcoming");
  });

  it("до открытия — скоро, ровно в момент открытия — открыт", () => {
    expect(stageState({ mode: "AUTO", opensAt: opens, closesAt: closes }, at("2026-11-01T08:59:59Z"))).toBe("upcoming");
    expect(stageState({ mode: "AUTO", opensAt: opens, closesAt: closes }, opens)).toBe("open");
  });

  it("ровно в момент закрытия и после — закрыт", () => {
    expect(stageState({ mode: "AUTO", opensAt: opens, closesAt: closes }, at("2026-11-15T20:59:59Z"))).toBe("open");
    expect(stageState({ mode: "AUTO", opensAt: opens, closesAt: closes }, closes)).toBe("closed");
  });

  it("без даты закрытия открытый этап не закрывается сам", () => {
    expect(stageState({ mode: "AUTO", opensAt: opens, closesAt: null }, at("2030-01-01T00:00:00Z"))).toBe("open");
  });
});
