import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteQuizQuestion, loadQuiz, moveQuizQuestion, saveQuizQuestion } from "./quiz";

let seasonId: string;
beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
});

const draft = (overrides: Partial<Parameters<typeof saveQuizQuestion>[1]> = {}) => ({
  text: "Что такое ША?",
  options: ["Проект", "Факультет", "Столовая"],
  correct: 0,
  isActive: true,
  ...overrides,
});

describe("вопросы викторины", () => {
  it("без текста и с одним вариантом не сохраняется", async () => {
    expect(await saveQuizQuestion(seasonId, draft({ text: "  " }))).toMatchObject({ ok: false });
    expect(await saveQuizQuestion(seasonId, draft({ options: ["Один"] }))).toMatchObject({ ok: false });
    expect(await saveQuizQuestion(seasonId, draft({ correct: 9 }))).toMatchObject({ ok: false });
  });

  it("создание, правка, порядок, удаление", async () => {
    expect(await saveQuizQuestion(seasonId, draft())).toEqual({ ok: true });
    expect(await saveQuizQuestion(seasonId, draft({ text: "Второй?" }))).toEqual({ ok: true });
    expect((await loadQuiz(seasonId)).map((question) => question.text)).toEqual(["Что такое ША?", "Второй?"]);

    const second = (await loadQuiz(seasonId))[1]!;
    expect(await moveQuizQuestion(seasonId, second.id, "up")).toEqual({ ok: true });
    expect((await loadQuiz(seasonId)).map((question) => question.text)).toEqual(["Второй?", "Что такое ША?"]);

    const first = (await loadQuiz(seasonId))[0]!;
    expect(await saveQuizQuestion(seasonId, draft({ id: first.id, text: "Правка?" }))).toEqual({ ok: true });
    expect(await deleteQuizQuestion(seasonId, first.id)).toEqual({ ok: true });
    expect(await loadQuiz(seasonId)).toHaveLength(1);
  });

  it("чужого и несуществующего не двигаем", async () => {
    expect(await deleteQuizQuestion(seasonId, "нет")).toMatchObject({ ok: false });
    expect(await moveQuizQuestion(seasonId, "нет", "up")).toMatchObject({ ok: false });
  });
});
