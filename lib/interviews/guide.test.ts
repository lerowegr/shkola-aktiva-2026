import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { loadGuide, saveNote } from "./guide";
import { DEFAULT_INTERVIEW_QUESTIONS } from "./questions";

describe("сценарий собеседования", () => {
  let seasonId: string;
  let applicationId: string;
  let me: string;
  let other: string;
  let questionId: string;

  beforeEach(async () => {
    await resetDatabase();
    const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
    seasonId = season.id;
    me = (await db.user.create({ data: { firstName: "Я" } })).id;
    other = (await db.user.create({ data: { firstName: "Другой" } })).id;
    const candidate = await db.user.create({ data: {} });
    applicationId = (
      await db.application.create({ data: { seasonId, userId: candidate.id, status: "SUBMITTED", submittedAt: new Date() } })
    ).id;
    questionId = (
      await db.interviewQuestion.create({ data: { seasonId, order: 1, block: "Блиц", text: "Сальто или мем?" } })
    ).id;
  });

  it("вопросы из таблицы: 13 штук, вводная первая", () => {
    expect(DEFAULT_INTERVIEW_QUESTIONS).toHaveLength(13);
    expect(DEFAULT_INTERVIEW_QUESTIONS[0]).toMatchObject({ block: "Вводная часть", intro: true });
    expect(DEFAULT_INTERVIEW_QUESTIONS.some((item) => item.block === "Блиц")).toBe(true);
  });

  it("ячейки: своя редактируется, чужая видна, пустая стирает", async () => {
    expect(await saveNote({ applicationId, questionId, authorId: me, note: "Отвечает бодро" })).toEqual({ ok: true });
    expect(await saveNote({ applicationId, questionId, authorId: other, note: "Согласен" })).toEqual({ ok: true });

    const blocks = await loadGuide(seasonId, applicationId, me);
    const notes = blocks[0]!.items[0]!.notes;
    expect(notes.map((item) => [item.authorName, item.isMine])).toEqual([
      ["Я", true],
      ["Другой", false],
    ]);

    expect(await saveNote({ applicationId, questionId, authorId: me, note: "   " })).toEqual({ ok: true });
    const after = await loadGuide(seasonId, applicationId, me);
    expect(after[0]!.items[0]!.notes.map((item) => item.authorId)).toEqual([other]);
  });

  it("чужой вопрос и чужая анкета отклоняются", async () => {
    expect(await saveNote({ applicationId, questionId: "нет", authorId: me, note: "x" })).toMatchObject({ ok: false });
    expect(await saveNote({ applicationId: "нет", questionId, authorId: me, note: "x" })).toMatchObject({ ok: false });
  });
});
