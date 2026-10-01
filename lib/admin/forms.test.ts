import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteCriterion, deleteMarker, deleteQuestion, loadEditor, move, saveCriterion, saveQuestion } from "./forms";

let seasonId: string;
beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
});

const choice = (id?: string, options = ["Очная", "Заочная"]) => ({
  id,
  section: "О себе",
  type: "SINGLE_CHOICE" as const,
  label: "Форма обучения",
  help: null,
  required: true,
  options,
  maxLength: null,
});

async function answer(questionId: string, value: string) {
  const user = await db.user.create({ data: {} });
  const application = await db.application.create({ data: { seasonId, userId: user.id } });
  await db.answer.create({ data: { applicationId: application.id, questionId, value } });
}

describe("редактор анкеты", () => {
  it("выбор без двух вариантов не сохраняется", async () => {
    expect(await saveQuestion(seasonId, choice(undefined, ["Одна"]))).toMatchObject({ ok: false });
  });

  it("вопрос с ответами: не удалить, тип не сменить, выбранный вариант не убрать", async () => {
    await saveQuestion(seasonId, choice());
    const question = await db.formQuestion.findFirstOrThrow();
    await answer(question.id, "Очная");

    expect(await deleteQuestion(seasonId, question.id)).toMatchObject({ ok: false });
    expect(await saveQuestion(seasonId, { ...choice(question.id), type: "SHORT_TEXT" })).toMatchObject({ ok: false });
    expect(await saveQuestion(seasonId, choice(question.id, ["Заочная", "Вечерняя"]))).toMatchObject({ ok: false });
    // Невыбранный вариант убрать можно, переименовать вопрос — тоже.
    expect(await saveQuestion(seasonId, { ...choice(question.id, ["Очная", "Вечерняя"]), label: "Как учитесь?" })).toEqual({ ok: true });
  });

  it("порядок меняется и остаётся сплошным", async () => {
    await saveQuestion(seasonId, { ...choice(), label: "Первый" });
    await saveQuestion(seasonId, { ...choice(), label: "Второй" });
    const second = await db.formQuestion.findFirstOrThrow({ where: { label: "Второй" } });

    await move("question", second.id, -1);
    expect((await loadEditor(seasonId)).questions.map((q) => q.label)).toEqual(["Второй", "Первый"]);
  });
});

describe("редактор оценки", () => {
  it("шкалу не сузить ниже поставленного балла, критерий с баллами не удалить", async () => {
    await saveCriterion(seasonId, { stage: "APPLICATION", title: "Интерес", badge: null, maxScore: 4, levels: [] });
    const criterion = await db.criterion.findFirstOrThrow();
    const reviewer = await db.user.create({ data: {} });
    const user = await db.user.create({ data: {} });
    const application = await db.application.create({ data: { seasonId, userId: user.id, status: "SUBMITTED" } });
    const review = await db.review.create({ data: { applicationId: application.id, stageKind: "APPLICATION", reviewerId: reviewer.id } });
    await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: 3 } });

    expect(await saveCriterion(seasonId, { id: criterion.id, stage: "APPLICATION", title: "Интерес", badge: null, maxScore: 2, levels: [] })).toMatchObject({ ok: false });
    expect(await saveCriterion(seasonId, { id: criterion.id, stage: "APPLICATION", title: "Интерес", badge: null, maxScore: 5, levels: [{ score: 9, text: "вне шкалы" }, { score: 5, text: "Отлично" }] })).toEqual({ ok: true });
    expect((await db.criterion.findFirstOrThrow()).levels).toEqual([{ score: 5, text: "Отлично" }]);
    expect(await deleteCriterion(criterion.id)).toMatchObject({ ok: false });
  });

  it("пустой маркер удаляется", async () => {
    const marker = await db.marker.create({ data: { seasonId, stageKind: "HOMEWORK", order: 1, title: "Оформление" } });
    expect(await deleteMarker(marker.id)).toEqual({ ok: true });
  });
});
