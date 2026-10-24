/**
 * Итог и статус оценки.
 *
 * Статус не хранится, а считается по баллам: «проверена» — значит, стоит
 * балл по каждому критерию. Хранимый статус кто-то однажды забудет
 * переключить, и анкета с пустыми баллами будет числиться проверенной.
 *
 * Файл без обращений к базе — его читают и списки, и карточка оценки.
 */

export type ReviewStatus = "new" | "progress" | "done";

export interface ReviewSummary {
  /** Сумма поставленных баллов; null — не поставлено ни одного. */
  total: number | null;
  /** Сумма максимумов всех критериев — знаменатель «3 из 6». */
  max: number;
  status: ReviewStatus;
}

export function reviewSummary(
  criteria: readonly { id: string; maxScore: number }[],
  scores: readonly { criterionId: string; score: number }[],
): ReviewSummary {
  const max = criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  const known = new Set(criteria.map((criterion) => criterion.id));
  const counted = scores.filter((score) => known.has(score.criterionId));

  if (counted.length === 0) return { total: null, max, status: "new" };

  const total = counted.reduce((sum, score) => sum + score.score, 0);
  const done = criteria.every((criterion) => counted.some((score) => score.criterionId === criterion.id));

  return { total, max, status: done ? "done" : "progress" };
}

/**
 * Какие баллы можно ставить. Расписаны баллы (0 / 2 / 4) — только они:
 * 1 и 3 у такого критерия не бывает. Расшифровок нет — любой от 0 до максимума.
 */
export function allowedScores(criterion: { maxScore: number; levels?: readonly { score: number; text?: string }[] | null }): number[] {
  const described = [...new Set((criterion.levels ?? []).filter((level) => level.text?.trim() !== "").map((level) => level.score))]
    .filter((score) => Number.isInteger(score) && score >= 0 && score <= criterion.maxScore)
    .sort((a, b) => a - b);
  return described.length ? described : Array.from({ length: criterion.maxScore + 1 }, (_, score) => score);
}

export function validScore(criterion: { maxScore: number; levels?: readonly { score: number; text?: string }[] | null }, score: number): boolean {
  return allowedScores(criterion).includes(score);
}
