import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { ForbiddenError } from "~~/lib/auth/actor";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), season: vi.fn(), accept: vi.fn(), meta: vi.fn() }));
vi.mock("~~/server/utils/session", () => ({ requirePermission: mocks.permission }));
vi.mock("~~/server/utils/season", () => ({ requireCurrentSeasonId: mocks.season }));
vi.mock("~~/server/utils/request-meta", () => ({ requestMeta: mocks.meta }));
vi.mock("~~/lib/applications/accept-by-staff", () => ({ acceptApplicationByStaff: mocks.accept }));
vi.stubGlobal("defineAction", (schema: ZodType, handler: (context: { event: object; body: unknown }) => Promise<unknown>) =>
  (context: { event: object; body: unknown }) => handler({ ...context, body: schema.parse(context.body) }));

const { default: action } = await import("./accept-application.post");
const call = action as unknown as (context: { event: object; body: object }) => Promise<unknown>;
const context = { event: {}, body: { userId: "candidate", sessionId: "session" } };

describe("права на принятие сохранённой анкеты", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "actor" });
    mocks.season.mockResolvedValue("season");
    mocks.meta.mockReturnValue({ ip: "test" });
    mocks.accept.mockResolvedValue({ ok: true });
  });

  it("проверяет оба права и передаёт конкретных кандидата, сбор и автора в аудит", async () => {
    expect(await call(context)).toEqual({ ok: true });
    expect(mocks.permission.mock.calls.map((args) => args[1])).toEqual(["users.manage", "applications.assign"]);
    expect(mocks.accept).toHaveBeenCalledWith({ seasonId: "season", userId: "candidate", actorId: "actor", sessionId: "session" }, { ip: "test" });
  });

  it.each(["users.manage", "applications.assign"])("без права %s не изменяет анкету", async (missing) => {
    mocks.permission.mockImplementation(async (_event: unknown, permission: string) => {
      if (permission === missing) throw new ForbiddenError("Нет доступа");
      return { id: "actor" };
    });
    await expect(call(context)).rejects.toThrow("Нет доступа");
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});
