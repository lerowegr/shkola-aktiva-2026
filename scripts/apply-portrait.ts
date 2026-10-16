/**
 * Перенести портрет участника ША'26 (lib/applications/portrait.ts) на сайт:
 * критерии и маркеры анкеты, ДЗ, ЦО и собеседования, вопросы и разделы
 * анкеты вместе с домашним заданием, сценарий собеседования.
 *
 * Безопасно для живых данных: этап заменяется, только пока по нему нет ни
 * одного балла и маркера; анкета — только пока нет ни одного ответа. Иначе
 * у этапа обновляются только тексты критериев (описание, индикаторы, расшифровки)
 * с тем же названием и максимумом; остальное правится в админке руками.
 *
 *   npx tsx scripts/apply-portrait.ts --dry-run   — только показать, что будет
 *   --keep-questions — вопросы анкеты не трогать (приём уже открыт: у кого-то
 *   анкета открыта в браузере, новые id вопросов сломали бы автосохранение)
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
import type { Prisma } from "../lib/generated/prisma/client";
import { DEFAULT_INTERVIEW_QUESTIONS } from "../lib/interviews/questions";

const dry = process.argv.includes("--dry-run");
const keepQuestions = process.argv.includes("--keep-questions");

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
      // Баллы уже стоят — структуру не трогаем, обновляем только тексты
      // критериев с тем же названием и тем же максимумом: баллы не теряют смысла.
      const existing = await db.criterion.findMany({ where: { seasonId: season.id, stageKind }, select: { id: true, title: true, maxScore: true } });
      const updates: Prisma.PrismaPromise<unknown>[] = existing.flatMap((row) => {
        const source = criteria.find((criterion) => criterion.title === row.title && criterion.maxScore === row.maxScore);
        return source
          ? [
              db.criterion.update({
                where: { id: row.id },
                data: { description: source.description ?? null, indicators: source.indicators ?? null, examples: source.examples ?? null, levels: source.levels },
              }),
            ]
          : [];
      });
      // Тексты маркеров с тем же названием — тоже.
      const markerRows = await db.marker.findMany({ where: { seasonId: season.id, stageKind }, select: { id: true, title: true } });
      for (const row of markerRows) {
        const source = markers.find((marker) => marker.title === row.title);
        if (source) updates.push(db.marker.update({ where: { id: row.id }, data: { example: source.example } }));
      }
      console.log(`· ${label}: уже стоят баллы (${scores}) и маркеры (${notes}) — обновлены только тексты критериев и маркеров (${updates.length}).`);
      if (!dry) await db.$transaction(updates);
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
          indicators: criterion.indicators ?? null,
          examples: criterion.examples ?? null,
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
  if (keepQuestions) {
    console.log("· Вопросы анкеты: не трогаем (--keep-questions).");
  } else if (answers > 0) {
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

  // Сценарий собеседования: заменяем целиком, пока мастера ничего в нём не написали.
  const guideNotes = await db.interviewNote.count({ where: { question: { seasonId: season.id } } });
  if (guideNotes > 0) {
    console.log(`· Сценарий собеса: пропуск — уже есть заметки мастеров (${guideNotes}). Правьте в админке.`);
  } else {
    console.log(`· Сценарий собеса: ${DEFAULT_INTERVIEW_QUESTIONS.length} вопросов`);
    if (!dry) {
      await db.$transaction([
        db.interviewQuestion.deleteMany({ where: { seasonId: season.id } }),
        db.interviewQuestion.createMany({
          data: DEFAULT_INTERVIEW_QUESTIONS.map((question, index) => ({
            seasonId: season.id,
            order: index + 1,
            block: question.block,
            text: question.text,
            intro: question.intro ?? false,
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
