import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

import { ForbiddenError } from "~~/lib/auth/actor";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), reviewer: vi.fn(), application: vi.fn(), reassign: vi.fn(), notify: vi.fn(), audit: vi.fn() }));
vi.mock("~~/server/utils/session", () => ({ requirePermission: mocks.permission }));
vi.mock("~~/lib/db", () => ({ db: { user: { findFirst: mocks.reviewer }, application: { findFirst: mocks.application } } }));
vi.mock("~~/lib/applications/assign", () => ({ reassignApplication: mocks.reassign }));
vi.mock("~~/lib/applications/notifications", () => ({ notifyAssigned: mocks.notify }));
vi.mock("~~/lib/applications/staff", () => ({ EVALUATED_STAGES: ["APPLICATION", "HOMEWORK", "ASSESSMENT", "INTERVIEW"] }));
vi.stubGlobal("audit", mocks.audit);
vi.stubGlobal("defineAction", (schema: ZodType, handler: (context: { event: object; body: unknown }) => Promise<unknown>) =>
  (context: { event: object; body: unknown }) => handler({ ...context, body: schema.parse(context.body) }));

const { default: action } = await import("./reassign.post");
const run = action as unknown as (context: { event: object; body: object }) => Promise<unknown>;
const body = { applicationId: "application", reviewerId: "reviewer", stage: "HOMEWORK" };

describe("переназначение с обязательным аудитом и выбором уведомления", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "actor" });
    mocks.reviewer.mockResolvedValue({ id: "reviewer", firstName: "Новый", lastName: "Мастер" });
    mocks.application.mockResolvedValue({ id: "application" });
    mocks.reassign.mockResolvedValue({ id: "review" });
  });

  it("без флага сохраняет прежнее поведение — аудит и уведомление", async () => {
    expect(await run({ event: {}, body })).toMatchObject({ ok: true });
    expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ actorId: "actor", action: "application.reassign", meta: expect.objectContaining({ notify: true, stage: "HOMEWORK" }) }));
    expect(mocks.notify).toHaveBeenCalledWith(["review"], "HOMEWORK");
  });

  it("без уведомлений выполняет передачу и обязательно пишет аудит", async () => {
    expect(await run({ event: {}, body: { ...body, notify: false } })).toMatchObject({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith({}, "applications.assign");
    expect(mocks.reassign).toHaveBeenCalledWith("application", "HOMEWORK", "reviewer");
    expect(mocks.audit).toHaveBeenCalledWith({}, expect.objectContaining({ action: "application.reassign", entityId: "application", meta: expect.objectContaining({ notify: false }) }));
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("отсутствие права не позволяет перенести даже без уведомлений", async () => {
    mocks.permission.mockRejectedValue(new ForbiddenError("Нет доступа"));
    await expect(run({ event: {}, body: { ...body, notify: false } })).rejects.toThrow("Нет доступа");
    expect(mocks.reassign).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("не передаёт анкету человеку, который не является активным мастером", async () => {
    mocks.reviewer.mockResolvedValue(null);
    expect(await run({ event: {}, body: { ...body, notify: false } })).toMatchObject({ ok: false });
    expect(mocks.reassign).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
