import type { Prisma } from "~~/lib/generated/prisma/client";

import type { AnswerValue } from "./form";

/**
 * Домашнее задание — раздел анкеты.
 *
 * Задания — вопросы раздела с пометкой «домашнее задание» (FormSection.
 * homework): текст задания в подсказке, ответ — ссылка на готовую работу.
 * Отвечают и проверяются они как вся анкета: автосохранение, «Далее»,
 * обязательность. При отправке анкеты ответы раздела становятся сдачей ДЗ
 * (Submission этапа HOMEWORK) — по ней работа попадает в «Оценку ДЗ», к
 * решениям и в рассылки, а мастер назначается на проверку ДЗ.
 */

/** Текст сдачи ДЗ из ответов раздела: «Задание — ссылка», по строке на задание. */
export function homeworkText(
  questions: readonly { id: string; section: string; label: string }[],
  homeworkSections: ReadonlySet<string>,
  answers: Record<string, AnswerValue | Prisma.JsonValue>,
): string | null {
  const lines = questions
    .filter((question) => homeworkSections.has(question.section))
    .map((question) => {
      const value = answers[question.id];
      const text = Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value.trim() : "";
      return text ? `${question.label}: ${text}` : null;
    })
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}
