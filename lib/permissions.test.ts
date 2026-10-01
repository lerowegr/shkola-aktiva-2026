import { describe, expect, it } from "vitest";

import {
  can,
  canAny,
  canGrantRole,
  PERMISSION_KEYS,
  sanitizePermissions,
  type Actor,
} from "./permissions";

function actor(overrides: Partial<Actor> = {}): Actor {
  return { isOwner: false, isActive: true, permissions: [], ...overrides };
}

describe("can", () => {
  it("владелец может любое известное право без ролей", () => {
    const owner = actor({ isOwner: true });
    for (const key of PERMISSION_KEYS) expect(can(owner, key)).toBe(true);
  });

  it("неизвестное право — нет ни у кого, даже у владельца", () => {
    expect(can(actor({ isOwner: true }), "nope.nothing")).toBe(false);
    expect(can(actor({ permissions: ["nope.nothing"] }), "nope.nothing")).toBe(false);
  });

  it("заблокированный не может ничего, даже с правами", () => {
    const blocked = actor({ isActive: false, permissions: ["applications.review"] });
    expect(can(blocked, "applications.review")).toBe(false);
  });

  it("право из роли даёт доступ, отсутствующее — нет", () => {
    const master = actor({ permissions: ["applications.review", "messages.reply"] });
    expect(can(master, "applications.review")).toBe(true);
    expect(can(master, "applications.decide")).toBe(false);
  });

  it("canAny — хватает одного", () => {
    const master = actor({ permissions: ["messages.reply"] });
    expect(canAny(master, ["applications.decide", "messages.reply"])).toBe(true);
    expect(canAny(master, ["applications.decide", "roles.manage"])).toBe(false);
  });
});

describe("sanitizePermissions", () => {
  it("выкидывает неизвестные ключи и дубли", () => {
    expect(
      sanitizePermissions(["applications.review", "nope", "applications.review"]),
    ).toEqual(["applications.review"]);
  });
});

describe("canGrantRole", () => {
  it("нельзя выдать роль с правом, которого нет у выдающего", () => {
    const lead = actor({ permissions: ["users.manage", "applications.review"] });
    expect(canGrantRole(lead, ["applications.review"])).toBe(true);
    expect(canGrantRole(lead, ["applications.review", "roles.manage"])).toBe(false);
  });

  it("владелец выдаёт любую роль", () => {
    expect(canGrantRole(actor({ isOwner: true }), [...PERMISSION_KEYS])).toBe(true);
  });
});
