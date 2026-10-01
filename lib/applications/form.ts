import type { QuestionType } from "~~/lib/generated/prisma/enums";

/**
 * Правила ответов на анкету.
 *
 * Проверки две, и они разные намеренно.
 *
 * normalizeAnswer — при автосохранении, на каждый ввод. Она мягкая: пускает
 * пустое и недописанное, потому что человек ещё печатает. Отказывает только
 * в том, что нельзя сохранить вообще: не тот тип, вариант не из списка,
 * текст длиннее лимита.
 *
 * submitProblems — при отправке. Она строгая: обязательное заполнено,
 * ссылка похожа на ссылку. Отказ отсюда — список понятных сообщений, по
 * которым форма подсвечивает поля.
 *
 * Файл без обращений к базе и серверу — его читает и форма в браузере.
 */

export type AnswerValue = string | string[];

export interface QuestionShape {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: readonly string[];
  maxLength: number | null;
}

export type Normalized = { ok: true; value: AnswerValue } | { ok: false; message: string };

export function normalizeAnswer(question: QuestionShape, raw: unknown): Normalized {
  switch (question.type) {
    case "MULTI_CHOICE": {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
        return { ok: false, message: "Выберите варианты из списка." };
      }
      if (raw.some((item) => !question.options.includes(item))) {
        return { ok: false, message: "Такого варианта нет. Обновите страницу." };
      }
      // Порядок списка, а не порядок нажатий: так ответы сравнимы между собой.
      return { ok: true, value: question.options.filter((option) => raw.includes(option)) };
    }

    case "SINGLE_CHOICE": {
      if (typeof raw !== "string") return { ok: false, message: "Выберите вариант из списка." };
      if (raw !== "" && !question.options.includes(raw)) {
        return { ok: false, message: "Такого варианта нет. Обновите страницу." };
      }
      return { ok: true, value: raw };
    }

    default: {
      if (typeof raw !== "string") return { ok: false, message: "Ответ должен быть текстом." };
      if (question.maxLength !== null && raw.length > question.maxLength) {
        return { ok: false, message: `Ответ длиннее ${question.maxLength} знаков — сократите его.` };
      }
      return { ok: true, value: raw };
    }
  }
}

export function isEmptyAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return true;
}

/**
 * Ссылка, как её вписывают люди: «vk.com/id1» без схемы — нормально.
 * Годится только http и https с точкой в имени сайта: «javascript:» и
 * просто слова ссылкой не считаются.
 */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface ProfileShape {
  lastName?: string | null;
  firstName?: string | null;
}

export interface SubmitProblem {
  /** Поле формы: lastName, firstName или id вопроса. */
  field: string;
  message: string;
}

export function submitProblems(
  questions: readonly QuestionShape[],
  answers: Readonly<Record<string, unknown>>,
  profile: ProfileShape,
): SubmitProblem[] {
  const problems: SubmitProblem[] = [];

  if (isEmptyAnswer(profile.lastName)) problems.push({ field: "lastName", message: "Укажите фамилию." });
  if (isEmptyAnswer(profile.firstName)) problems.push({ field: "firstName", message: "Укажите имя." });

  for (const question of questions) {
    const value = answers[question.id];

    if (isEmptyAnswer(value)) {
      if (question.required) {
        problems.push({ field: question.id, message: `Ответьте на вопрос «${question.label}».` });
      }
      continue;
    }

    if (question.type === "URL" && typeof value === "string" && !normalizeUrl(value)) {
      problems.push({
        field: question.id,
        message: `В вопросе «${question.label}» нужна ссылка, например vk.com/id123.`,
      });
    }
  }

  return problems;
}
