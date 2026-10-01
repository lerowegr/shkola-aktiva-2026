import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { ACK_TEXT, receiveFromTelegram } from "./bot-inbox";

const tg = { id: "555", firstName: "Даниил", lastName: null, username: "dan_kov" };
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 11, minutes));

beforeEach(async () => {
  await resetDatabase();
  await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
});

describe("сообщения боту", () => {
  it("первое сообщение — в ветку и подтверждение; следующее в полчаса — без подтверждения", async () => {
    expect(await receiveFromTelegram(tg, "Здравствуйте! Когда результаты?", at(0))).toEqual({ ok: true, reply: ACK_TEXT });
    expect(await receiveFromTelegram(tg, "И ещё вопрос", at(5))).toEqual({ ok: true, reply: null });
    expect(await receiveFromTelegram(tg, "Прошёл час", at(40))).toEqual({ ok: true, reply: ACK_TEXT });

    const messages = await db.message.findMany({ orderBy: { createdAt: "asc" }, select: { author: true, via: true } });
    expect(messages.map((m) => m.author)).toEqual(["CANDIDATE", "BOT", "CANDIDATE", "CANDIDATE", "BOT"]);
    expect(messages.every((m) => m.via === "TELEGRAM")).toBe(true);
  });

  it("незнакомый Telegram становится кандидатом", async () => {
    await receiveFromTelegram(tg, "Привет", at(0));
    expect(await db.user.count({ where: { telegramId: "555" } })).toBe(1);
  });

  it("заблокированному — отказ, сообщение не сохраняется", async () => {
    await db.user.create({ data: { telegramId: "555", status: "BLOCKED" } });
    const result = await receiveFromTelegram(tg, "Привет", at(0));
    expect(result.ok).toBe(false);
    expect(await db.message.count()).toBe(0);
  });
});
