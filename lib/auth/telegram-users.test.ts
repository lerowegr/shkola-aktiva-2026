import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { confirmLoginCode, linkTelegram, upsertTelegramUser } from "./telegram-users";

beforeEach(resetDatabase);

const alina = { id: "1001", firstName: "Алина", lastName: "Смирнова", username: "alina_sm" };

describe("upsertTelegramUser", () => {
  it("незнакомый Telegram — новый кандидат с именем из Telegram", async () => {
    const user = await upsertTelegramUser(alina);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(row.telegramId).toBe("1001");
    expect(row.firstName).toBe("Алина");
    expect(row.telegramUsername).toBe("alina_sm");
  });

  it("второй вход не создаёт второго человека и не затирает имя", async () => {
    const first = await upsertTelegramUser(alina);
    await db.user.update({ where: { id: first.id }, data: { firstName: "Алина Олеговна" } });

    const second = await upsertTelegramUser({ ...alina, username: "alina_new" });
    const row = await db.user.findUniqueOrThrow({ where: { id: first.id } });

    expect(second.id).toBe(first.id);
    expect(await db.user.count()).toBe(1);
    expect(row.firstName).toBe("Алина Олеговна");
    expect(row.telegramUsername).toBe("alina_new");
  });
});

describe("confirmLoginCode", () => {
  async function code(minutes = 5) {
    return db.telegramLoginCode.create({
      data: { code: "abc", expiresAt: new Date(Date.now() + minutes * 60_000) },
    });
  }

  it("живой код привязывается к человеку, которого при нужде создаёт", async () => {
    await code();
    const result = await confirmLoginCode("abc", alina);
    const row = await db.telegramLoginCode.findUniqueOrThrow({ where: { code: "abc" } });

    expect(result.ok).toBe(true);
    expect(row.telegramId).toBe("1001");
    expect(row.userId).not.toBeNull();
  });

  it("просроченный или неизвестный код — отказ", async () => {
    await code(-1);
    expect(await confirmLoginCode("abc", alina)).toEqual({ ok: false, reason: "stale" });
    expect(await confirmLoginCode("нет", alina)).toEqual({ ok: false, reason: "stale" });
  });

  it("заблокированного не пускает", async () => {
    await code();
    const user = await upsertTelegramUser(alina);
    await db.user.update({ where: { id: user.id }, data: { status: "BLOCKED" } });

    expect(await confirmLoginCode("abc", alina)).toEqual({ ok: false, reason: "blocked" });
  });
});

describe("linkTelegram", () => {
  async function linkCode(userId: string, minutes = 10) {
    return db.telegramLinkCode.create({
      data: { code: "lnk", userId, expiresAt: new Date(Date.now() + minutes * 60_000) },
    });
  }

  it("привязывает Telegram к аккаунту по почте", async () => {
    const user = await db.user.create({ data: { email: "a@mail.ru", firstName: "Алина" } });
    await linkCode(user.id);

    expect(await linkTelegram("lnk", alina)).toEqual({ ok: true, name: "Алина" });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).telegramId).toBe("1001");
    expect(await linkTelegram("lnk", alina)).toEqual({ ok: false, reason: "stale" });
  });

  it("чужой Telegram не перехватывает", async () => {
    await upsertTelegramUser(alina);
    const user = await db.user.create({ data: { email: "a@mail.ru" } });
    await linkCode(user.id);

    expect(await linkTelegram("lnk", alina)).toEqual({ ok: false, reason: "taken" });
  });

  it("просроченный код — отказ", async () => {
    const user = await db.user.create({ data: { email: "a@mail.ru" } });
    await linkCode(user.id, -1);
    expect(await linkTelegram("lnk", alina)).toEqual({ ok: false, reason: "stale" });
  });
});
