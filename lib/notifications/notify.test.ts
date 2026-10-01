import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { notify } from "./notify";
import { MAX_ATTEMPTS, processDeliveries, type PushError, type Senders } from "./worker";

const NOON = new Date("2026-10-05T11:00:00Z"); // 14:00 по Москве
const LATER = new Date("2026-10-05T11:05:00Z");

beforeEach(resetDatabase);

async function person(opts: { telegramId?: string; push?: boolean } = {}) {
  const user = await db.user.create({ data: { firstName: "Алина", telegramId: opts.telegramId ?? null } });
  if (opts.push) {
    await db.pushSubscription.create({
      data: { userId: user.id, endpoint: `https://push.example/${user.id}`, p256dh: "k", auth: "a" },
    });
  }
  return user;
}

const message = (userId: string, key = "k1") => ({
  userId,
  category: "MESSAGES" as const,
  title: "Вам ответили",
  body: "Организаторы ответили на сообщение",
  url: "/cabinet/messages",
  key,
});

function recorder(options: { telegramFails?: number; pushStatus?: number } = {}) {
  const sent: string[] = [];
  let telegramFails = options.telegramFails ?? 0;
  const senders: Senders = {
    telegram: async (chatId) => {
      if (telegramFails > 0) {
        telegramFails--;
        throw new Error("Telegram недоступен");
      }
      sent.push(`tg:${chatId}`);
    },
    push: async (target) => {
      if (options.pushStatus) {
        const error = new Error("gone") as PushError;
        error.statusCode = options.pushStatus;
        throw error;
      }
      sent.push(`push:${target.endpoint}`);
    },
  };
  return { sent, senders };
}

describe("notify", () => {
  it("колокольчик сразу, повтор по ключу не дублирует", async () => {
    const user = await person();
    await notify([message(user.id)], { now: NOON });
    await notify([message(user.id)], { now: NOON });
    expect(await db.notification.count()).toBe(1);
  });

  it("доставки — только в доступные и включённые каналы", async () => {
    const both = await person({ telegramId: "111", push: true });
    const none = await person();
    const muted = await person({ telegramId: "222" });
    await db.notificationPreference.create({
      data: { userId: muted.id, channel: "TELEGRAM", category: "MESSAGES", enabled: false },
    });

    await notify([message(both.id), message(none.id), message(muted.id)], { now: NOON });

    const deliveries = await db.notificationDelivery.findMany({ select: { userId: true, channel: true } });
    expect(deliveries.filter((d) => d.userId === both.id).map((d) => d.channel).sort()).toEqual(["PUSH", "TELEGRAM"]);
    expect(deliveries.filter((d) => d.userId !== both.id)).toEqual([]);
  });

  it("анкеты организаторам по умолчанию — только в колокольчик", async () => {
    const master = await person({ telegramId: "333", push: true });
    await notify([{ userId: master.id, category: "REVIEW", title: "Вам назначена анкета", key: "a1" }], { now: NOON });
    expect(await db.notification.count()).toBe(1);
    expect(await db.notificationDelivery.count()).toBe(0);
  });
});

describe("processDeliveries", () => {
  it("не созревшее не трогает, созревшее отправляет", async () => {
    const user = await person({ telegramId: "111" });
    await notify([message(user.id)], { now: NOON });
    const { sent, senders } = recorder();

    expect((await processDeliveries({ senders, now: NOON, gapMs: 0 })).sent).toBe(0);
    expect((await processDeliveries({ senders, now: LATER, gapMs: 0 })).sent).toBe(1);
    expect(sent).toEqual(["tg:111"]);
  });

  it("прочитанное на сайте не дублируется в Telegram", async () => {
    const user = await person({ telegramId: "111" });
    await notify([message(user.id)], { now: NOON });
    await db.notification.updateMany({ data: { readAt: NOON } });
    const { sent, senders } = recorder();

    const result = await processDeliveries({ senders, now: LATER, gapMs: 0 });
    expect(result.skipped).toBe(1);
    expect(sent).toEqual([]);
  });

  it("без бота — пропуск, а не ошибка", async () => {
    const user = await person({ telegramId: "111" });
    await notify([message(user.id)], { now: NOON });
    const result = await processDeliveries({ senders: { telegram: null, push: null }, now: LATER, gapMs: 0 });
    expect(result.skipped).toBe(1);
  });

  it("сбой — повтор позже, после третьего — FAILED", async () => {
    const user = await person({ telegramId: "111" });
    await notify([message(user.id)], { now: NOON });
    const { senders } = recorder({ telegramFails: 99 });

    let at = LATER;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await processDeliveries({ senders, now: at, gapMs: 0 });
      at = new Date(at.getTime() + 10 * 60 * 1000);
    }

    const delivery = await db.notificationDelivery.findFirstOrThrow();
    expect(delivery.status).toBe("FAILED");
    expect(delivery.attempts).toBe(MAX_ATTEMPTS);
  });

  it("сбой, потом успех — SENT", async () => {
    const user = await person({ telegramId: "111" });
    await notify([message(user.id)], { now: NOON });
    const { sent, senders } = recorder({ telegramFails: 1 });

    await processDeliveries({ senders, now: LATER, gapMs: 0 });
    await processDeliveries({ senders, now: new Date(LATER.getTime() + 10 * 60 * 1000), gapMs: 0 });

    expect(sent).toEqual(["tg:111"]);
    expect((await db.notificationDelivery.findFirstOrThrow()).status).toBe("SENT");
  });

  it("отозванная подписка пуша удаляется", async () => {
    const user = await person({ push: true });
    await notify([message(user.id)], { now: NOON });
    const { senders } = recorder({ pushStatus: 410 });

    const result = await processDeliveries({ senders, now: LATER, gapMs: 0 });
    expect(result.skipped).toBe(1);
    expect(await db.pushSubscription.count()).toBe(0);
  });

  it("два пересёкшихся прохода не шлют дважды", async () => {
    const user = await person({ telegramId: "111" });
    await notify([message(user.id)], { now: NOON });
    const { sent, senders } = recorder();

    await Promise.all([
      processDeliveries({ senders, now: LATER, gapMs: 0 }),
      processDeliveries({ senders, now: LATER, gapMs: 0 }),
    ]);
    expect(sent).toEqual(["tg:111"]);
  });
});
