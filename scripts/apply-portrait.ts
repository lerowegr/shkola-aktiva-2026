/**
 * Перенести портрет участника ША'26 (lib/applications/portrait.ts) на сайт:
 * критерии и маркеры анкеты, ДЗ, ЦО и собеседования, вопросы и разделы
 * анкеты вместе с домашним заданием.
 *
 * Безопасно для живых данных: этап заменяется, только пока по нему нет ни
 * одного балла и маркера; анкета — только пока нет ни одного ответа. Иначе
 * этап пропускается с объяснением — такие правки делаются в админке руками.
 *
 *   npx tsx scripts/apply-portrait.ts --dry-run   — только показать, что будет
 *   npx tsx scripts/apply-portrait.ts
 */
import {
  DEFAULT_APPLICATION_CRITERIA,
  DEFAULT_APPLICATION_MARKERS,
  DEFAULT_APPLICATION_QUESTIONS,
  DEFAULT_APPLICATION_SECTIONS,
  DEFAULT_ASSESSMENT_CRITERIA,
  DEFAULT_ASSESSMENT_MARKERS,
  DEFAULT_HOMEWORK_CRITERIA,
  DEFAULT_HOMEWORK_MARKERS,
  DEFAULT_INTERVIEW_CRITERIA,
  DEFAULT_INTERVIEW_MARKERS,
  type DefaultCriterion,
  type DefaultMarker,
} from "../lib/applications/defaults";
import { db } from "../lib/db";

const dry = process.argv.includes("--dry-run");

const STAGES = [
  ["APPLICATION", "Анкета", DEFAULT_APPLICATION_CRITERIA, DEFAULT_APPLICATION_MARKERS],
  ["HOMEWORK", "ДЗ", DEFAULT_HOMEWORK_CRITERIA, DEFAULT_HOMEWORK_MARKERS],
  ["ASSESSMENT", "ЦО", DEFAULT_ASSESSMENT_CRITERIA, DEFAULT_ASSESSMENT_MARKERS],
  ["INTERVIEW", "Собеседование", DEFAULT_INTERVIEW_CRITERIA, DEFAULT_INTERVIEW_MARKERS],
] as const satisfies readonly (readonly [string, string, DefaultCriterion[], DefaultMarker[]])[];

async function main() {
  const season = await db.season.findFirstOrThrow({ where: { isCurrent: true }, select: { id: true, title: true } });
  console.log(`Сезон: ${season.title}${dry ? " (проверка, без записи)" : ""}`);

  for (const [stageKind, label, criteria, markers] of STAGES) {
    const [scores, notes] = await Promise.all([
      db.reviewScore.count({ where: { criterion: { seasonId: season.id, stageKind } } }),
      db.reviewMarker.count({ where: { marker: { seasonId: season.id, stageKind } } }),
    ]);
    if (scores + notes > 0) {
      console.log(`· ${label}: пропуск — уже стоят баллы (${scores}) и маркеры (${notes}). Правьте в админке.`);
      continue;
    }
    console.log(`· ${label}: критериев ${criteria.length} (${criteria.map((c) => `${c.title} 0–${c.maxScore}`).join(", ")}), маркеров ${markers.length}`);
    if (dry) continue;
    await db.$transaction([
      db.criterion.deleteMany({ where: { seasonId: season.id, stageKind } }),
      db.marker.deleteMany({ where: { seasonId: season.id, stageKind } }),
      db.criterion.createMany({
        data: criteria.map((criterion, index) => ({
          seasonId: season.id,
          stageKind,
          order: index + 1,
          title: criterion.title,
          badge: criterion.badge ?? null,
          description: criterion.description ?? null,
          maxScore: criterion.maxScore,
          levels: criterion.levels,
        })),
      }),
      db.marker.createMany({
        data: markers.map((marker, index) => ({ seasonId: season.id, stageKind, order: index + 1, title: marker.title, example: marker.example })),
      }),
    ]);
  }

  const answers = await db.answer.count({ where: { application: { seasonId: season.id } } });
  if (answers > 0) {
    console.log(`· Вопросы анкеты: пропуск — уже есть ответы (${answers}). Правьте в админке.`);
  } else {
    console.log(`· Вопросы анкеты: ${DEFAULT_APPLICATION_QUESTIONS.length} в ${DEFAULT_APPLICATION_SECTIONS.length} разделах`);
    if (!dry) {
      await db.$transaction([
        db.formQuestion.deleteMany({ where: { seasonId: season.id, stageKind: "APPLICATION" } }),
        db.formSection.deleteMany({ where: { seasonId: season.id, stageKind: "APPLICATION" } }),
        db.formSection.createMany({
          data: DEFAULT_APPLICATION_SECTIONS.map((section, index) => ({
            seasonId: season.id,
            stageKind: "APPLICATION" as const,
            order: index + 1,
            title: section.title,
            description: section.description ?? null,
            homework: section.homework ?? false,
          })),
        }),
        db.formQuestion.createMany({
          data: DEFAULT_APPLICATION_QUESTIONS.map((question, index) => ({
            seasonId: season.id,
            stageKind: "APPLICATION" as const,
            order: index + 1,
            section: question.section,
            type: question.type,
            label: question.label,
            help: question.help ?? null,
            required: question.required ?? true,
            options: question.options ?? [],
            maxLength: question.maxLength ?? null,
            minLength: question.minLength ?? null,
            format: question.format ?? null,
          })),
        }),
      ]);
    }
  }

  if (!dry) {
    await db.auditLog.create({ data: { action: "form.portrait", meta: { season: season.title } } });
  }
  console.log(dry ? "Проверка закончена — ничего не записано." : "Готово.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
