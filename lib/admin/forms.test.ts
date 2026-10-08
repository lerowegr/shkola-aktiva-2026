import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteCriterion, deleteMarker, deleteQuestion, deleteSection, loadEditor, move, saveCriterion, saveQuestion, saveSection } from "./forms";

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

describe("разделы анкеты", () => {
  const text = (section: string, label: string) => ({
    section,
    type: "SHORT_TEXT" as const,
    label,
    help: null,
    required: true,
    options: [],
    maxLength: 200,
  });
  const order = async () =>
    (await db.formQuestion.findMany({ orderBy: { order: "asc" }, select: { label: true, section: true } })).map(
      (question) => `${question.section}: ${question.label}`,
    );

  it("вопрос в новый раздел — раздел заводится сам, в конце", async () => {
    await saveQuestion(seasonId, text("Контакты", "ФИО"));
    await saveQuestion(seasonId, text("Опыт", "Команда"));
    const editor = await loadEditor(seasonId);
    expect(editor.sections.map((section) => section.title)).toEqual(["Контакты", "Опыт"]);
  });

  it("вопрос, добавленный в первый раздел, встаёт в его конец, а не в конец анкеты", async () => {
    await saveQuestion(seasonId, text("Контакты", "ФИО"));
    await saveQuestion(seasonId, text("Опыт", "Команда"));
    await saveQuestion(seasonId, text("Контакты", "Телефон"));
    expect(await order()).toEqual(["Контакты: ФИО", "Контакты: Телефон", "Опыт: Команда"]);
  });

  it("переименование раздела переносит его вопросы, описание сохраняется", async () => {
    await saveQuestion(seasonId, text("Контакты", "ФИО"));
    const section = await db.formSection.findFirstOrThrow();
    expect(await saveSection(seasonId, { id: section.id, title: "Контактная информация", description: "Как с тобой связаться" })).toEqual({ ok: true });
    expect(await order()).toEqual(["Контактная информация: ФИО"]);
    expect((await db.formSection.findFirstOrThrow()).description).toBe("Как с тобой связаться");
  });

  it("два раздела с одним названием — отказ", async () => {
    await saveSection(seasonId, { title: "Опыт", description: null });
    expect(await saveSection(seasonId, { title: " Опыт ", description: null })).toMatchObject({ ok: false });
  });

  it("перестановка раздела перестраивает порядок вопросов", async () => {
    await saveQuestion(seasonId, text("Контакты", "ФИО"));
    await saveQuestion(seasonId, text("Опыт", "Команда"));
    const second = await db.formSection.findFirstOrThrow({ where: { title: "Опыт" } });
    await move("section", second.id, -1);
    expect(await order()).toEqual(["Опыт: Команда", "Контакты: ФИО"]);
  });

  it("вопрос двигается только внутри своего раздела", async () => {
    await saveQuestion(seasonId, text("Контакты", "ФИО"));
    await saveQuestion(seasonId, text("Опыт", "Команда"));
    const team = await db.formQuestion.findFirstOrThrow({ where: { label: "Команда" } });
    await move("question", team.id, -1);
    expect(await order()).toEqual(["Контакты: ФИО", "Опыт: Команда"]);
  });

  it("раздел с вопросами не удалить, пустой — можно", async () => {
    await saveQuestion(seasonId, text("Контакты", "ФИО"));
    await saveSection(seasonId, { title: "Пустой", description: null });
    const [full, empty] = await db.formSection.findMany({ orderBy: { order: "asc" } });
    expect(await deleteSection(seasonId, full!.id)).toMatchObject({ ok: false });
    expect(await deleteSection(seasonId, empty!.id)).toEqual({ ok: true });
  });

  it("формат: только у строки; у вопроса с ответами не меняется", async () => {
    expect(await saveQuestion(seasonId, { ...text("Контакты", "Телефон"), type: "LONG_TEXT", format: "PHONE" })).toMatchObject({ ok: false });
    await saveQuestion(seasonId, { ...text("Контакты", "Телефон"), format: "PHONE" });
    const phone = await db.formQuestion.findFirstOrThrow();
    expect(phone.format).toBe("PHONE");
    await answer(phone.id, "+7 (999) 123-45-67");
    expect(await saveQuestion(seasonId, { ...text("Контакты", "Телефон"), id: phone.id, format: "DIGITS" })).toMatchObject({ ok: false });
  });

  it("минимум не больше максимума", async () => {
    expect(
      await saveQuestion(seasonId, { ...text("Опыт", "О себе"), type: "LONG_TEXT", maxLength: 100, minLength: 200 }),
    ).toMatchObject({ ok: false });
  });
});
