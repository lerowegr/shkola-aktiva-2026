import { db } from "~~/lib/db";
import type { QuestionFormat, QuestionType, StageKind } from "~~/lib/generated/prisma/enums";

import type { AdminResult } from "./roles";

/**
 * Редактор анкеты, критериев и маркеров.
 *
 * Править можно всё, что не ломает уже собранное. Поэтому запреты:
 * - вопрос с ответами не удалить и не сменить ему тип;
 * - вариант ответа, который уже кто-то выбрал, не убрать;
 * - критерий с баллами не удалить, а шкалу не сузить ниже поставленного;
 * - маркер с заметками не удалить;
 * - раздел с вопросами не удалить, формат вопроса с ответами не сменить.
 * Переименовать и переформулировать можно всегда.
 *
 * Разделы — шаги анкеты. Вопросы ссылаются на раздел по названию, а их
 * сквозной порядок (order) всегда идёт по разделам: всё, что сортирует
 * вопросы по order (карточка мастера, списки), показывает их по шагам.
 */
type Evaluated = Extract<StageKind, "APPLICATION" | "HOMEWORK" | "ASSESSMENT" | "INTERVIEW">;

export interface QuestionInput {
  id?: string;
  section: string;
  type: QuestionType;
  label: string;
  help: string | null;
  required: boolean;
  options: string[];
  maxLength: number | null;
  minLength?: number | null;
  format?: QuestionFormat | null;
}

const CHOICE: QuestionType[] = ["SINGLE_CHOICE", "MULTI_CHOICE"];

export async function loadEditor(seasonId: string) {
  const [sections, questions, criteria, markers] = await Promise.all([
    db.formSection.findMany({
      where: { seasonId, stageKind: "APPLICATION" },
      orderBy: { order: "asc" },
      select: { id: true, title: true, description: true, homework: true },
    }),
    db.formQuestion.findMany({
      where: { seasonId, stageKind: "APPLICATION" },
      orderBy: { order: "asc" },
      select: {
        id: true,
        section: true,
        type: true,
        label: true,
        help: true,
        required: true,
        options: true,
        maxLength: true,
        minLength: true,
        format: true,
        _count: { select: { answers: true } },
      },
    }),
    db.criterion.findMany({
      where: { seasonId },
      orderBy: [{ stageKind: "asc" }, { order: "asc" }],
      select: {
        id: true,
        stageKind: true,
        title: true,
        badge: true,
        description: true,
        indicators: true,
        examples: true,
        maxScore: true,
        levels: true,
        _count: { select: { scores: true } },
      },
    }),
    db.marker.findMany({
      where: { seasonId },
      orderBy: [{ stageKind: "asc" }, { order: "asc" }],
      select: { id: true, stageKind: true, title: true, example: true, _count: { select: { notes: true } } },
    }),
  ]);

  return {
    sections,
    questions: questions.map(({ _count, ...question }) => ({ ...question, answers: _count.answers })),
    criteria: criteria.map(({ _count, ...criterion }) => ({
      ...criterion,
      levels: criterion.levels as { score: number; text: string }[],
      scores: _count.scores,
    })),
    markers: markers.map(({ _count, ...marker }) => ({ ...marker, notes: _count.notes })),
  };
}

// --- Вопросы ------------------------------------------------------------------

async function usedOptions(questionId: string): Promise<Set<string>> {
  const answers = await db.answer.findMany({ where: { questionId }, select: { value: true } });
  return new Set(answers.flatMap((answer) => (Array.isArray(answer.value) ? answer.value : [answer.value])).map(String));
}

// --- Разделы ------------------------------------------------------------------

/** Раздел по названию — или новый в конце. */
async function ensureSection(seasonId: string, title: string) {
  const existing = await db.formSection.findUnique({
    where: { seasonId_stageKind_title: { seasonId, stageKind: "APPLICATION", title } },
  });
  if (existing) return existing;
  const last = await db.formSection.aggregate({ where: { seasonId, stageKind: "APPLICATION" }, _max: { order: true } });
  return db.formSection.create({
    data: { seasonId, stageKind: "APPLICATION", title, order: (last._max.order ?? 0) + 1 },
  });
}

/**
 * Сквозной порядок вопросов — по разделам: сначала порядок раздела, внутри —
 * порядок вопроса. Вопрос без раздела в таблице — в конце.
 */
export async function renumberQuestions(seasonId: string): Promise<void> {
  const [sections, questions] = await Promise.all([
    db.formSection.findMany({ where: { seasonId, stageKind: "APPLICATION" }, select: { title: true, order: true } }),
    db.formQuestion.findMany({ where: { seasonId, stageKind: "APPLICATION" }, select: { id: true, section: true, order: true } }),
  ]);
  const rank = new Map(sections.map((section) => [section.title, section.order]));
  const sorted = [...questions].sort(
    (a, b) => (rank.get(a.section) ?? Infinity) - (rank.get(b.section) ?? Infinity) || a.order - b.order,
  );
  await db.$transaction(sorted.map((question, index) => db.formQuestion.update({ where: { id: question.id }, data: { order: index + 1 } })));
}

export async function saveSection(
  seasonId: string,
  input: { id?: string; title: string; description: string | null; homework?: boolean },
): Promise<AdminResult> {
  const title = input.title.trim();
  const homework = input.homework ?? false;
  if (!title) return { ok: false, message: "Назовите раздел." };
  const description = input.description?.trim() || null;

  const twin = await db.formSection.findUnique({
    where: { seasonId_stageKind_title: { seasonId, stageKind: "APPLICATION", title } },
    select: { id: true },
  });
  if (twin && twin.id !== input.id) return { ok: false, message: `Раздел «${title}» уже есть — выберите другое название.` };

  if (input.id) {
    const current = await db.formSection.findFirst({ where: { id: input.id, seasonId } });
    if (!current) return { ok: false, message: "Раздел не найден — обновите страницу." };
    // Вопросы ссылаются на раздел по названию — переименовываем вместе.
    await db.$transaction([
      db.formQuestion.updateMany({ where: { seasonId, stageKind: "APPLICATION", section: current.title }, data: { section: title } }),
      db.formSection.update({ where: { id: input.id }, data: { title, description, homework } }),
    ]);
    return { ok: true };
  }

  const last = await db.formSection.aggregate({ where: { seasonId, stageKind: "APPLICATION" }, _max: { order: true } });
  await db.formSection.create({
    data: { seasonId, stageKind: "APPLICATION", title, description, homework, order: (last._max.order ?? 0) + 1 },
  });
  return { ok: true };
}

export async function deleteSection(seasonId: string, id: string): Promise<AdminResult> {
  const section = await db.formSection.findFirst({ where: { id, seasonId } });
  if (!section) return { ok: false, message: "Раздел не найден." };
  const questions = await db.formQuestion.count({ where: { seasonId, stageKind: "APPLICATION", section: section.title } });
  if (questions > 0) {
    return { ok: false, message: `В разделе вопросов: ${questions}. Перенесите их в другой раздел или удалите — потом удалите раздел.` };
  }
  await db.formSection.delete({ where: { id } });
  return { ok: true };
}

// --- Вопросы (сохранение) -------------------------------------------------------

export async function saveQuestion(seasonId: string, input: QuestionInput): Promise<AdminResult> {
  const label = input.label.trim();
  if (!label) return { ok: false, message: "Напишите сам вопрос." };

  const format = input.format ?? null;
  if (format && input.type !== "SHORT_TEXT") return { ok: false, message: "Формат бывает только у вопроса «строка»." };
  const minLength = CHOICE.includes(input.type) ? null : (input.minLength ?? null);
  if (minLength !== null && (!Number.isInteger(minLength) || minLength < 1)) {
    return { ok: false, message: "Минимум — целое число знаков больше нуля, или пусто." };
  }
  if (minLength !== null && input.maxLength !== null && minLength > input.maxLength) {
    return { ok: false, message: `Минимум ${minLength} больше максимума ${input.maxLength} — так ответить не получится.` };
  }

  const options = [...new Set(input.options.map((option) => option.trim()).filter(Boolean))];
  if (CHOICE.includes(input.type) && options.length < 2) {
    return { ok: false, message: "Для выбора нужно хотя бы два варианта." };
  }

  const data = {
    section: input.section.trim() || "Вопросы",
    type: input.type,
    label,
    help: input.help?.trim() || null,
    required: input.required,
    options: CHOICE.includes(input.type) ? options : [],
    maxLength: CHOICE.includes(input.type) ? null : input.maxLength,
    minLength,
    format,
  };
  await ensureSection(seasonId, data.section);

  if (input.id) {
    const current = await db.formQuestion.findFirst({
      where: { id: input.id, seasonId },
      select: { type: true, format: true, section: true, _count: { select: { answers: true } } },
    });
    if (!current) return { ok: false, message: "Вопрос не найден — обновите страницу." };

    if (current._count.answers > 0) {
      if (current.type !== input.type) {
        return { ok: false, message: "На вопрос уже отвечали — тип ответа менять нельзя. Создайте новый вопрос." };
      }
      if ((current.format ?? null) !== format) {
        return { ok: false, message: "На вопрос уже отвечали — формат менять нельзя: старые ответы ему не подойдут." };
      }
      if (CHOICE.includes(input.type)) {
        const removed = [...(await usedOptions(input.id))].filter((option) => option && !options.includes(option));
        if (removed.length) {
          return { ok: false, message: `Вариант «${removed[0]}» уже выбирали — убрать его нельзя.` };
        }
      }
    }

    await db.formQuestion.update({ where: { id: input.id }, data });
    if (current.section !== data.section) await renumberQuestions(seasonId);
    return { ok: true };
  }

  // Новый — в конец своего раздела: большой номер, потом сквозной пересчёт.
  const last = await db.formQuestion.aggregate({ where: { seasonId, stageKind: "APPLICATION" }, _max: { order: true } });
  await db.formQuestion.create({ data: { ...data, seasonId, stageKind: "APPLICATION", order: (last._max.order ?? 0) + 1 } });
  await renumberQuestions(seasonId);
  return { ok: true };
}

export async function deleteQuestion(seasonId: string, id: string): Promise<AdminResult> {
  const question = await db.formQuestion.findFirst({
    where: { id, seasonId },
    select: { _count: { select: { answers: true } } },
  });
  if (!question) return { ok: false, message: "Вопрос не найден." };
  if (question._count.answers > 0) {
    return { ok: false, message: "На вопрос уже отвечали — удалить его нельзя, иначе пропадут ответы. Его можно сделать необязательным." };
  }
  await db.formQuestion.delete({ where: { id } });
  return { ok: true };
}

/** Переставить вопрос, критерий или маркер на шаг вверх или вниз. */
/**
 * Название пункта — для журнала: после удаления по id его уже не опознать,
 * а «кто удалил вопрос X» должно читаться через год.
 */
export async function itemTitle(kind: "question" | "criterion" | "marker" | "section", id: string): Promise<string | null> {
  if (kind === "section") return (await db.formSection.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
  if (kind === "question") return (await db.formQuestion.findUnique({ where: { id }, select: { label: true } }))?.label ?? null;
  if (kind === "criterion") return (await db.criterion.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
  return (await db.marker.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
}

export async function move(
  kind: "question" | "criterion" | "marker" | "section",
  id: string,
  direction: -1 | 1,
): Promise<AdminResult> {
  const table = { question: db.formQuestion, criterion: db.criterion, marker: db.marker, section: db.formSection }[kind] as unknown as {
    findUnique: (args: unknown) => Promise<{ id: string; seasonId: string; stageKind: StageKind; order: number; section?: string } | null>;
    findMany: (args: unknown) => Promise<{ id: string; order: number }[]>;
    update: (args: unknown) => unknown;
  };

  const item = await table.findUnique({
    where: { id },
    select: { id: true, seasonId: true, stageKind: true, order: true, ...(kind === "question" ? { section: true } : {}) },
  });
  if (!item) return { ok: false, message: "Не найдено — обновите страницу." };

  // Вопрос ходит только внутри своего раздела.
  const siblings = await table.findMany({
    where: { seasonId: item.seasonId, stageKind: item.stageKind, ...(kind === "question" ? { section: item.section } : {}) },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const index = siblings.findIndex((sibling) => sibling.id === id);
  const other = siblings[index + direction];
  if (!other) return { ok: true };

  // Перенумеровываем всех подряд: так порядок не ломается, даже если
  // раньше в номерах были дыры или повторы.
  const reordered = [...siblings];
  [reordered[index], reordered[index + direction]] = [reordered[index + direction]!, reordered[index]!];
  // Номера внутри группы — те же, что были: соседей просто меняем местами.
  const slots = siblings.map((sibling) => sibling.order).sort((a, b) => a - b);
  await db.$transaction(
    reordered.map((sibling, position) =>
      table.update({ where: { id: sibling.id }, data: { order: kind === "question" ? slots[position] : position + 1 } }),
    ) as never,
  );
  if (kind === "section" || kind === "question") await renumberQuestions(item.seasonId);
  return { ok: true };
}

// --- Критерии -----------------------------------------------------------------

export interface CriterionInput {
  id?: string;
  stage: Evaluated;
  title: string;
  badge: string | null;
  description?: string | null;
  indicators?: string | null;
  examples?: string | null;
  maxScore: number;
  levels: { score: number; text: string }[];
}

export async function saveCriterion(seasonId: string, input: CriterionInput): Promise<AdminResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Назовите критерий." };
  if (!Number.isInteger(input.maxScore) || input.maxScore < 1 || input.maxScore > 10) {
    return { ok: false, message: "Шкала — от 0 до числа от 1 до 10." };
  }

  const levels = input.levels
    .map((level) => ({ score: level.score, text: level.text.trim() }))
    .filter((level) => level.text && Number.isInteger(level.score) && level.score >= 0 && level.score <= input.maxScore)
    .sort((a, b) => a.score - b.score);

  const description = input.description?.trim() || null;
  if (description && description.length > 1000) return { ok: false, message: "Описание — до 1000 знаков." };
  const indicators = input.indicators?.trim() || null;
  if (indicators && indicators.length > 3000) return { ok: false, message: "Индикаторы — до 3000 знаков." };
  const examples = input.examples?.trim() || null;
  if (examples && examples.length > 5000) return { ok: false, message: "Примеры — до 5000 знаков." };
  const data = { title, badge: input.badge?.trim() || null, description, indicators, examples, maxScore: input.maxScore, levels };

  if (input.id) {
    const top = await db.reviewScore.aggregate({ where: { criterionId: input.id }, _max: { score: true } });
    if ((top._max.score ?? 0) > input.maxScore) {
      return { ok: false, message: `Уже стоит балл ${top._max.score} — шкалу нельзя сделать меньше.` };
    }
    await db.criterion.update({ where: { id: input.id }, data });
    return { ok: true };
  }

  const last = await db.criterion.aggregate({ where: { seasonId, stageKind: input.stage }, _max: { order: true } });
  await db.criterion.create({ data: { ...data, seasonId, stageKind: input.stage, order: (last._max.order ?? 0) + 1 } });
  return { ok: true };
}

export async function deleteCriterion(id: string): Promise<AdminResult> {
  const scores = await db.reviewScore.count({ where: { criterionId: id } });
  if (scores > 0) return { ok: false, message: "По критерию уже ставили баллы — удалить его нельзя." };
  await db.criterion.delete({ where: { id } }).catch(() => null);
  return { ok: true };
}

// --- Маркеры ------------------------------------------------------------------

export async function saveMarker(
  seasonId: string,
  input: { id?: string; stage: Evaluated; title: string; example: string | null },
): Promise<AdminResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Назовите маркер." };
  const data = { title, example: input.example?.trim() || null };

  if (input.id) {
    await db.marker.update({ where: { id: input.id }, data });
    return { ok: true };
  }
  const last = await db.marker.aggregate({ where: { seasonId, stageKind: input.stage }, _max: { order: true } });
  await db.marker.create({ data: { ...data, seasonId, stageKind: input.stage, order: (last._max.order ?? 0) + 1 } });
  return { ok: true };
}

export async function deleteMarker(id: string): Promise<AdminResult> {
  const notes = await db.reviewMarker.count({ where: { markerId: id } });
  if (notes > 0) return { ok: false, message: "По маркеру уже писали заметки — удалить его нельзя." };
  await db.marker.delete({ where: { id } }).catch(() => null);
  return { ok: true };
}
