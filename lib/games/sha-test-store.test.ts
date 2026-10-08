import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { loadCandidateTest, submitTest, testOverview, testRows } from "./sha-test-store";

describe("тест про ША на базе", () => {
  let seasonId: string;
  let ids: string[];

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    ids = [];
    for (const [order, [text, options, correct]] of ([
      ["Сколько дней?", ["1", "2", "3"], 2],
      ["Из искры — …", ["свет", "пламя"], 1],
    ] as const).entries()) {
      ids.push((await db.quizQuestion.create({ data: { seasonId, order, text, options: [...options], correct } })).id);
    }
  });

  it("вопросы без верных ответов, одна попытка, второй раз — отказ", async () => {
    const user = await db.user.create({ data: { firstName: "Аня" } });
    const before = await loadCandidateTest(user.id);
    expect(before.done).toBeNull();
    expect(before.questions).toHaveLength(2);
    expect(JSON.stringify(before)).not.toContain("correct");

    const answers = [
      { questionId: ids[0]!, chosen: 2, ms: 1000 },
      { questionId: ids[1]!, chosen: 0, ms: 2000 },
    ];
    expect(await submitTest(user.id, answers)).toEqual({ ok: true, score: 1, total: 2 });
    expect(await submitTest(user.id, answers)).toMatchObject({ ok: false });

    const after = await loadCandidateTest(user.id);
    expect(after.done).toMatchObject({ score: 1, total: 2, fromBot: false });
    expect(after.questions).toEqual([]);
  });

  it("результат из бота находится по Telegram и привязывается", async () => {
    await db.quizAttempt.create({
      data: {
        seasonId,
        telegramId: "555",
        score: 7,
        total: 10,
        durationMs: 30_000,
        source: "BOT",
        answers: [{ questionId: null, question: "Из искры — …", chosen: "", correct: true, ms: 900 }],
        profile: { lastName: "Петров", firstName: "Пётр", phone: "+79990000000", username: "petr" },
      },
    });
    const user = await db.user.create({ data: { firstName: "Пётр", telegramId: "555" } });

    expect((await loadCandidateTest(user.id)).done).toMatchObject({ score: 7, fromBot: true });
    expect(await db.quizAttempt.count({ where: { userId: user.id } })).toBe(1);
    expect(await submitTest(user.id, [])).toMatchObject({ ok: false });

    const rows = await testRows(seasonId);
    expect(rows[0]).toMatchObject({ name: "Пётр", telegram: "@petr", phone: "+79990000000", source: "BOT" });
    const stats = await testOverview(seasonId);
    expect(stats.questions.find((row) => row.question === "Из искры — …")?.answered).toBe(1);
  });
});
