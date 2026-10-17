import type { QuestionFormat, QuestionType } from "~~/lib/generated/prisma/enums";

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
 * Форматы (formatValue) приводят строку к единому виду: ВК — ссылка на vk.ru,
 * телефон — +7 (XXX) XXX-XX-XX, группа — ТЦБМ23-2. Мастер видит одинаковое
 * у всех и открывает ссылку одним нажатием.
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
  /** Не короче — «подробно, от 200 знаков». */
  minLength?: number | null;
  /** Формат строки: цифры, группа, телефон, ВК, Telegram. */
  format?: QuestionFormat | null;
}

export type Formatted = { ok: true; value: string } | { ok: false; message: string };

/** «1 знак», «2 знака», «5 знаков». */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const VK_HOSTS = new Set(["vk.com", "vk.ru", "m.vk.com", "m.vk.ru", "www.vk.com", "www.vk.ru"]);
const TELEGRAM_HOSTS = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i;

/** Пример под каждый формат — в подсказке поля и в тексте ошибки. */
export const FORMAT_EXAMPLE: Record<QuestionFormat, string> = {
  DIGITS: "1901234",
  GROUP: "Ю26-3В",
  PHONE: "+7 999 123-45-67",
  VK: "vk.ru/ivan",
  TELEGRAM: "@ivan_petrov",
};

/**
 * Привести ответ к единому виду или объяснить, что не так. Пустое — не
 * ошибка формата: обязательность проверяется отдельно.
 */
export function formatValue(format: QuestionFormat, raw: string): Formatted {
  const value = raw.trim();
  if (!value) return { ok: true, value: "" };

  switch (format) {
    case "DIGITS": {
      const digits = value.replace(/\s+/g, "");
      return /^\d+$/.test(digits) ? { ok: true, value: digits } : { ok: false, message: "Только цифры, без букв и знаков." };
    }

    case "GROUP": {
      const group = value.replace(/\s+/g, "").replace(/[–—]/g, "-").toUpperCase();
      return /^[А-ЯЁA-Z]{1,8}\d{2}-\d{1,2}[А-ЯЁA-Z]?$/.test(group)
        ? { ok: true, value: group }
        : { ok: false, message: "Номер группы — буквы, две цифры года и номер через дефис; в конце может быть буква. Например, Ю26-3В или ТЦБМ23-2." };
    }

    case "PHONE": {
      let digits = value.replace(/\D/g, "");
      if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) digits = digits.slice(1);
      if (digits.length !== 10) {
        return { ok: false, message: "Номер телефона — 10 цифр после +7, например +7 999 123-45-67." };
      }
      return { ok: true, value: `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}` };
    }

    case "VK": {
      let name = value;
      if (/[./]/.test(value) && !value.startsWith("@")) {
        try {
          const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
          if (!VK_HOSTS.has(url.hostname.toLowerCase())) {
            return { ok: false, message: "Нужна ссылка на страницу ВКонтакте, например vk.ru/ivan." };
          }
          name = url.pathname.split("/").filter(Boolean)[0] ?? "";
        } catch {
          return { ok: false, message: "Нужна ссылка на страницу ВКонтакте, например vk.ru/ivan." };
        }
      }
      name = name.replace(/^@/, "");
      return /^[A-Za-z0-9_.]{2,64}$/.test(name)
        ? { ok: true, value: `https://vk.ru/${name}` }
        : { ok: false, message: "Нужна ссылка на страницу ВКонтакте, например vk.ru/ivan." };
    }

    case "TELEGRAM": {
      const name = value.replace(TELEGRAM_HOSTS, "").replace(/^@/, "").replace(/\/.*$/, "");
      return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)
        ? { ok: true, value: `@${name}` }
        : { ok: false, message: "Ник в Telegram — 5–32 латинские буквы, цифры или «_», например @ivan_petrov." };
    }
  }
}

/** Ссылка ведёт на Google Диск — его и советуем для ДЗ (другие тоже принимаем). */
export function isGoogleDrive(value: string): boolean {
  const url = normalizeUrl(value);
  if (!url) return false;
  const host = new URL(url).hostname.toLowerCase();
  return host === "drive.google.com" || host === "docs.google.com";
}

/** Сколько не хватает до рекомендованного минимума — или null, если хватает. */
export function shortBy(question: QuestionShape, value: string): number | null {
  if (!question.minLength) return null;
  const missing = question.minLength - value.trim().length;
  return missing > 0 ? missing : null;
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
      // Верный ввод храним уже приведённым, недописанный — как есть.
      if (question.format) {
        const formatted = formatValue(question.format, raw);
        if (formatted.ok && formatted.value) return { ok: true, value: formatted.value };
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
  studentId?: string | null;
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
  if (isEmptyAnswer(profile.studentId)) {
    problems.push({ field: "studentId", message: "Укажите номер студенческого билета." });
  } else if (!formatValue("DIGITS", profile.studentId ?? "").ok) {
    problems.push({ field: "studentId", message: "Номер студенческого — только цифры." });
  }

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
        message: `В вопросе «${question.label}» нужна ссылка, например vk.ru/id123.`,
      });
      continue;
    }

    if (typeof value !== "string") continue;

    if (question.format) {
      const formatted = formatValue(question.format, value);
      if (!formatted.ok) {
        problems.push({ field: question.id, message: formatted.message });
        continue;
      }
    }

    // Минимум знаков — только совет (счётчик у поля): короткий ответ
    // отправить можно, решает мастер отбора.
  }

  return problems;
}

/**
 * Что мешает уйти с шага анкеты: те же правила, что при отправке, но только
 * по полям этого раздела (id вопросов и поля профиля).
 */
export function stepProblems(
  questions: readonly QuestionShape[],
  answers: Readonly<Record<string, unknown>>,
  profile: ProfileShape,
  fields: readonly string[],
): SubmitProblem[] {
  const wanted = new Set(fields);
  return submitProblems(questions, answers, profile).filter((problem) => wanted.has(problem.field));
}
