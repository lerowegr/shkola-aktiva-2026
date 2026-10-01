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

export function validScore(criterion: { maxScore: number }, score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= criterion.maxScore;
}
