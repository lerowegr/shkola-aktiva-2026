import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "~~/lib/auth/actor";

const mocks = vi.hoisted(() => ({ requireSignedIn: vi.fn(), submitTest: vi.fn() }));
vi.mock("~~/server/utils/session", () => ({ requireSignedIn: mocks.requireSignedIn }));
vi.mock("~~/lib/games/sha-test-store", () => ({ submitTest: mocks.submitTest }));

// Проверяем договор доступа самого обработчика; разбор тела и преобразование
// ForbiddenError в 403 остаются в существующей общей обёртке defineAction.
vi.stubGlobal("defineAction", (_schema: unknown, handler: unknown) => handler);
const { default: action } = await import("./submit.post");
const submit = action as unknown as (context: { event: object; body: { answers: object[] } }) => Promise<unknown>;
const context = { event: {}, body: { answers: [{ questionId: "q", chosen: 0, ms: 1000 }] } };

describe("доступ к тесту до регистрации на отбор", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.submitTest.mockResolvedValue({ ok: true, score: 1, total: 1 });
  });

  it("принимает ответы вошедшего пользователя без заполненного профиля", async () => {
    mocks.requireSignedIn.mockResolvedValue({ id: "new", needsProfile: true, mustChangePassword: false });
    expect(await submit(context)).toEqual({ ok: true, score: 1, total: 1 });
    expect(mocks.requireSignedIn).toHaveBeenCalledWith(context.event);
    expect(mocks.submitTest).toHaveBeenCalledWith("new", context.body.answers);
  });

  it("не отправляет ответы без действующей сессии", async () => {
    mocks.requireSignedIn.mockRejectedValue(new ForbiddenError("Нужно войти."));
    await expect(submit(context)).rejects.toThrow("Нужно войти.");
    expect(mocks.submitTest).not.toHaveBeenCalled();
  });

  it("не обходит обязательную смену временного пароля", async () => {
    mocks.requireSignedIn.mockResolvedValue({ id: "temp", needsProfile: true, mustChangePassword: true });
    await expect(submit(context)).rejects.toThrow("Сначала задайте свой пароль");
    expect(mocks.submitTest).not.toHaveBeenCalled();
  });
});
