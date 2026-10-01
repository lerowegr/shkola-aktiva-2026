import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODES_PER_HOUR,
  requestEmailCode,
  verifyEmailCode,
} from "./email-code";

// Письма в тестах не уходят никуда: перехватываем отправку и читаем код.
const sent: { to: string; text: string }[] = [];
vi.mock("~~/lib/mail", () => ({
  sendMail: async (mail: { to: string; text: string }) => {
    sent.push(mail);
  },
}));

function lastCode(): string {
  const match = sent.at(-1)?.text.match(/\b(\d{6})\b/);
  if (!match) throw new Error("в письме нет кода");
  return match[1]!;
}

function wrong(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

beforeEach(async () => {
  await resetDatabase();
  sent.length = 0;
  vi.useRealTimers();
});

describe("requestEmailCode", () => {
  it("отправляет шестизначный код на нормализованный адрес", async () => {
    expect(await requestEmailCode("  Alina@Mail.RU ")).toEqual({ ok: true });
    expect(sent[0]?.to).toBe("alina@mail.ru");
    expect(lastCode()).toMatch(/^\d{6}$/);
  });

  it("не чаще раза в минуту на один адрес", async () => {
    await requestEmailCode("a@mail.ru");
    expect(await requestEmailCode("a@mail.ru")).toEqual({ ok: false, reason: "too_often" });
    expect(await requestEmailCode("b@mail.ru")).toEqual({ ok: true });
  });

  it("не больше пяти кодов в час на адрес", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();

    for (let i = 0; i < EMAIL_CODES_PER_HOUR; i++) {
      vi.setSystemTime(start + i * 2 * 60 * 1000);
      expect(await requestEmailCode("a@mail.ru")).toEqual({ ok: true });
    }

    vi.setSystemTime(start + EMAIL_CODES_PER_HOUR * 2 * 60 * 1000);
    expect(await requestEmailCode("a@mail.ru")).toEqual({ ok: false, reason: "too_often" });
  });

  it("в базе лежит не код, а хеш", async () => {
    await requestEmailCode("a@mail.ru");
    const row = await db.emailLoginCode.findFirstOrThrow();
    expect(row.codeHash).not.toContain(lastCode());
  });
});

describe("verifyEmailCode", () => {
  it("верный код впускает, создаёт кандидата и гасится", async () => {
    await requestEmailCode("a@mail.ru");
    const code = lastCode();

    const result = await verifyEmailCode("A@mail.ru", code);
    expect(result.ok).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { email: "a@mail.ru" } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(result.ok && result.userId).toBe(user.id);

    expect(await verifyEmailCode("a@mail.ru", code)).toEqual({ ok: false, reason: "expired" });
  });

  it("знакомый адрес не создаёт второго человека", async () => {
    const existing = await db.user.create({ data: { email: "a@mail.ru" } });
    await requestEmailCode("a@mail.ru");

    const result = await verifyEmailCode("a@mail.ru", lastCode());
    expect(result.ok && result.userId).toBe(existing.id);
    expect(await db.user.count()).toBe(1);
  });

  it("неверный код считает попытки, после лимита не спасает и верный", async () => {
    await requestEmailCode("a@mail.ru");
    const code = lastCode();

    for (let i = 0; i < EMAIL_CODE_MAX_ATTEMPTS; i++) {
      expect(await verifyEmailCode("a@mail.ru", wrong(code))).toEqual({ ok: false, reason: "wrong" });
    }
    expect(await verifyEmailCode("a@mail.ru", code)).toEqual({ ok: false, reason: "too_many" });
  });

  it("просроченный код не пускает", async () => {
    await requestEmailCode("a@mail.ru");
    const code = lastCode();

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);

    expect(await verifyEmailCode("a@mail.ru", code)).toEqual({ ok: false, reason: "expired" });
  });

  it("заблокированного не пускает", async () => {
    await db.user.create({ data: { email: "a@mail.ru", status: "BLOCKED" } });
    await requestEmailCode("a@mail.ru");

    expect(await verifyEmailCode("a@mail.ru", lastCode())).toEqual({ ok: false, reason: "blocked" });
  });

  it("без запроса кода — как просроченный", async () => {
    expect(await verifyEmailCode("a@mail.ru", "123456")).toEqual({ ok: false, reason: "expired" });
  });
});
