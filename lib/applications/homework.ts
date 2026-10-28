import type { Prisma } from "~~/lib/generated/prisma/client";

import type { AnswerValue } from "./form";

export interface HomeworkLink {
  label: string;
  url: string;
}

/** Прямые ссылки из текста сданного ДЗ; одинаковую папку показываем один раз. */
export function homeworkLinks(text: string | null | undefined): HomeworkLink[] {
  const links: HomeworkLink[] = [];
  const seen = new Set<string>();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const matches = [...line.matchAll(/https?:\/\/[^\s<>"']+/gi)];
    const label = line.slice(0, matches[0]?.index ?? 0).trim().replace(/:\s*$/, "") || "Домашнее задание";
    for (const match of matches) {
      const raw = match[0].replace(/[.,;!?]+$/, "");
      try {
        const url = new URL(raw);
        if (!url.hostname || url.username || url.password || seen.has(url.href)) continue;
        seen.add(url.href);
        links.push({ label, url: url.href });
      } catch {
        // Некорректный адрес не превращаем в ссылку.
      }
    }
  }
  return links;
}

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
