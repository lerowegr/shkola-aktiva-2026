/**
 * «Тест про ША»: правила без базы — подсчёт, снимок ответов, итоги.
 *
 * Модуль чистый: его читают сервер и страница админки. Верный ответ живёт
 * только на сервере: клиент присылает, какой вариант выбран (индекс в
 * исходном порядке), и время на вопрос — счёт считается здесь.
 */

export interface TestQuestion {
  id: string;
  text: string;
  options: string[];
  correct: number;
}

/** Ответ на вопрос в момент прохождения — не зависит от поздних правок. */
export interface AnswerSnapshot {
  questionId: string | null;
  question: string;
  chosen: string;
  correct: boolean;
  ms: number;
}

export interface Submission {
  questionId: string;
  chosen: number;
  ms: number;
}

/** Больше — уже не «читал вопрос», а ушёл пить чай: в итоги не тянем. */
export const MAX_MS_PER_QUESTION = 10 * 60 * 1000;

export type GradeResult =
  | { ok: true; score: number; total: number; durationMs: number; answers: AnswerSnapshot[] }
  | { ok: false; message: string };

/** Проверить ответы на все вопросы теста и посчитать баллы. */
export function grade(questions: readonly TestQuestion[], submission: readonly Submission[]): GradeResult {
  if (questions.length === 0) return { ok: false, message: "В тесте пока нет вопросов — загляните позже." };
  const byId = new Map(submission.map((item) => [item.questionId, item]));
  if (byId.size !== submission.length) return { ok: false, message: "Ответ на один вопрос пришёл дважды — пройдите тест заново." };

  const answers: AnswerSnapshot[] = [];
  for (const question of questions) {
    const given = byId.get(question.id);
    if (!given) return { ok: false, message: "Ответьте на все вопросы — тогда тест засчитается." };
    if (!Number.isInteger(given.chosen) || given.chosen < 0 || given.chosen >= question.options.length) {
      return { ok: false, message: "Вопросы поменялись, пока вы отвечали, — откройте тест заново." };
    }
    answers.push({
      questionId: question.id,
      question: question.text,
      chosen: question.options[given.chosen]!,
      correct: given.chosen === question.correct,
      ms: Math.max(0, Math.min(MAX_MS_PER_QUESTION, Math.round(given.ms))),
    });
  }
  if (submission.length !== questions.length) return { ok: false, message: "Вопросы поменялись, пока вы отвечали, — откройте тест заново." };

  return {
    ok: true,
    score: answers.filter((answer) => answer.correct).length,
    total: answers.length,
    durationMs: answers.reduce((sum, answer) => sum + answer.ms, 0),
    answers,
  };
}

/** Снимок из JSON базы; мусор — пустой список. */
export function readAnswers(raw: unknown): AnswerSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (typeof value.question !== "string" || typeof value.correct !== "boolean") return [];
    return [
      {
        questionId: typeof value.questionId === "string" ? value.questionId : null,
        question: value.question,
        chosen: typeof value.chosen === "string" ? value.chosen : "",
        correct: value.correct,
        ms: typeof value.ms === "number" ? value.ms : 0,
      },
    ];
  });
}

export interface TestStats {
  participants: number;
  average: number | null;
  /** Сколько человек набрали 0, 1, … total баллов. */
  distribution: { score: number; count: number }[];
  /** По вопросам — в порядке текущего теста; вопросы, которых уже нет, — в конце. */
  questions: { question: string; answered: number; correctShare: number; averageMs: number }[];
  bySource: { site: number; bot: number };
}

export function testStats(
  attempts: readonly { score: number; total: number; source: string; answers: AnswerSnapshot[] }[],
  order: readonly { id: string; text: string }[],
): TestStats {
  const participants = attempts.length;
  const top = Math.max(10, ...attempts.map((attempt) => attempt.total));
  const distribution = Array.from({ length: top + 1 }, (_, score) => ({
    score,
    count: attempts.filter((attempt) => attempt.score === score).length,
  }));

  // Ключ вопроса — id, а у перенесённых из бота без id — текст.
  const groups = new Map<string, { question: string; answers: AnswerSnapshot[] }>();
  const keyOf = (answer: AnswerSnapshot) => {
    if (answer.questionId) return answer.questionId;
    return order.find((question) => question.text === answer.question)?.id ?? `text:${answer.question}`;
  };
  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const key = keyOf(answer);
      const group = groups.get(key) ?? { question: answer.question, answers: [] };
      group.answers.push(answer);
      groups.set(key, group);
    }
  }
  const rank = (key: string) => {
    const index = order.findIndex((question) => question.id === key);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return {
    participants,
    average: participants ? Math.round((attempts.reduce((sum, attempt) => sum + attempt.score, 0) / participants) * 10) / 10 : null,
    distribution,
    questions: [...groups.entries()]
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([key, group]) => ({
        question: order.find((question) => question.id === key)?.text ?? group.question,
        answered: group.answers.length,
        correctShare: group.answers.filter((answer) => answer.correct).length / group.answers.length,
        averageMs: Math.round(group.answers.reduce((sum, answer) => sum + answer.ms, 0) / group.answers.length),
      })),
    bySource: {
      site: attempts.filter((attempt) => attempt.source === "SITE").length,
      bot: attempts.filter((attempt) => attempt.source === "BOT").length,
    },
  };
}

/** Строка CSV для русского Excel: «;» и кавычки, формулы обезврежены. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Формулу Excel запускает «=», «@» и «+»/«-» перед не-цифрой; телефон «+7…» не трогаем.
  if (/^[=@\t\r]/.test(text) || /^[+-][^\d]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
