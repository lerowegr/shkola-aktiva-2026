import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteGuideQuestion, loadGuideQuestions, moveGuideQuestion, saveGuideQuestion } from "./interview-guide";

let seasonId: string;
beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
});

const draft = (overrides: Partial<Parameters<typeof saveGuideQuestion>[1]> = {}) => ({
  block: "Блиц",
  text: "Сальто или мем?",
  intro: false,
  ...overrides,
});

describe("сценарий собеседования", () => {
  it("без блока и текста не сохраняется", async () => {
    expect(await saveGuideQuestion(seasonId, draft({ block: "  " }))).toMatchObject({ ok: false });
    expect(await saveGuideQuestion(seasonId, draft({ text: "" }))).toMatchObject({ ok: false });
  });

  it("создание, правка, порядок, удаление", async () => {
    expect(await saveGuideQuestion(seasonId, draft())).toEqual({ ok: true });
    expect(await saveGuideQuestion(seasonId, draft({ block: "Отводка", text: "Что изменить?" }))).toEqual({ ok: true });
    expect((await loadGuideQuestions(seasonId)).map((question) => question.block)).toEqual(["Блиц", "Отводка"]);

    const second = (await loadGuideQuestions(seasonId))[1]!;
    expect(await moveGuideQuestion(seasonId, second.id, "up")).toEqual({ ok: true });
    expect((await loadGuideQuestions(seasonId)).map((question) => question.block)).toEqual(["Отводка", "Блиц"]);

    const first = (await loadGuideQuestions(seasonId))[0]!;
    expect(await saveGuideQuestion(seasonId, draft({ id: first.id, text: "Правка?" }))).toEqual({ ok: true });
    expect(await deleteGuideQuestion(seasonId, first.id)).toEqual({ ok: true });
    expect(await loadGuideQuestions(seasonId)).toHaveLength(1);
  });

  it("вопрос с заметками не удаляется", async () => {
    await saveGuideQuestion(seasonId, draft());
    const question = (await loadGuideQuestions(seasonId))[0]!;
    const user = await db.user.create({ data: {} });
    const candidate = await db.user.create({ data: {} });
    const application = await db.application.create({
      data: { seasonId, userId: candidate.id, status: "SUBMITTED", submittedAt: new Date() },
    });
    await db.interviewNote.create({ data: { applicationId: application.id, questionId: question.id, authorId: user.id, note: "x" } });
    expect(await deleteGuideQuestion(seasonId, question.id)).toMatchObject({ ok: false });
    expect(await moveGuideQuestion(seasonId, "нет", "up")).toMatchObject({ ok: false });
  });
});
