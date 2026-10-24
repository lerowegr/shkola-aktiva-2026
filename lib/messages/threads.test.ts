import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { listThreads, markThreadRead, postMessage, threadFor } from "./threads";

let seasonId: string;

beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
});

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 11, minutes));

describe("переписка", () => {
  it("сообщение кандидата делает ветку новой для организаторов, ответ — снимает", async () => {
    const candidate = await db.user.create({ data: { firstName: "Алина", lastName: "Смирнова" } });
    const staff = await db.user.create({ data: { firstName: "Катя" } });
    const thread = await threadFor(seasonId, candidate.id);

    await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: candidate.id, text: "Куда прислать домашку?", via: "SITE", now: at(1) });
    expect((await listThreads(seasonId)).unread).toBe(1);

    await postMessage({ threadId: thread.id, author: "STAFF", authorId: staff.id, text: "Сюда, в чат", via: "SITE", now: at(2) });
    const list = await listThreads(seasonId);
    expect(list.unread).toBe(0);
    expect(list.rows[0]).toMatchObject({ name: "Алина Смирнова", lastText: "Сюда, в чат", lastAuthor: "STAFF" });
  });

  it("прочитанная организатором ветка не новая, пока кандидат не напишет снова", async () => {
    const candidate = await db.user.create({ data: { firstName: "Алина" } });
    const thread = await threadFor(seasonId, candidate.id);
    await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: candidate.id, text: "Привет", via: "TELEGRAM", now: at(1) });

    await markThreadRead(thread.id, "staff", at(2));
    expect((await listThreads(seasonId)).unread).toBe(0);

    await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: candidate.id, text: "Ещё вопрос", via: "TELEGRAM", now: at(3) });
    expect((await listThreads(seasonId)).unread).toBe(1);
  });

  it("автоответ бота не гасит новый вопрос кандидата", async () => {
    const candidate = await db.user.create({ data: { firstName: "Алина" } });
    const thread = await threadFor(seasonId, candidate.id);
    await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: candidate.id, text: "Вопрос", via: "TELEGRAM", now: at(1) });
    await postMessage({ threadId: thread.id, author: "BOT", authorId: null, text: "Спасибо, получили", via: "TELEGRAM", now: at(2) });

    const list = await listThreads(seasonId);
    expect(list.unread).toBe(1);
    expect(list.rows[0]?.lastText).toBe("Вопрос");
  });

  it("ответ организатора — уведомление кандидату", async () => {
    const candidate = await db.user.create({ data: { firstName: "Алина" } });
    const staff = await db.user.create({ data: { firstName: "Катя" } });
    const thread = await threadFor(seasonId, candidate.id);

    await postMessage({ threadId: thread.id, author: "STAFF", authorId: staff.id, text: "Здравствуйте!", via: "SITE" });

    const notification = await db.notification.findFirstOrThrow({ where: { userId: candidate.id } });
    expect(notification).toMatchObject({ category: "MESSAGES", title: "Сообщение от Школы Актива", url: "/cabinet/messages" });
  });

  it("сообщение кандидата — уведомление его мастеру, а не всем", async () => {
    const candidate = await db.user.create({ data: { firstName: "Алина", lastName: "Смирнова" } });
    const master = await db.user.create({ data: { firstName: "Катя" } });
    const other = await db.user.create({ data: { firstName: "Илья" } });
    const application = await db.application.create({ data: { seasonId, userId: candidate.id, status: "SUBMITTED" } });
    await db.review.create({ data: { applicationId: application.id, stageKind: "APPLICATION", reviewerId: master.id } });
    const thread = await threadFor(seasonId, candidate.id);

    await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: candidate.id, text: "Вопрос", via: "SITE" });

    expect(await db.notification.count({ where: { userId: master.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: other.id } })).toBe(0);
  });

  it("поиск по имени и нику", async () => {
    const alina = await db.user.create({ data: { firstName: "Алина", telegramUsername: "alina_sm" } });
    const dan = await db.user.create({ data: { firstName: "Даниил" } });
    for (const user of [alina, dan]) {
      const thread = await threadFor(seasonId, user.id);
      await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: user.id, text: "Привет", via: "SITE" });
    }
    expect((await listThreads(seasonId, "@alina")).rows.map((row) => row.name)).toEqual(["Алина"]);
  });
});
