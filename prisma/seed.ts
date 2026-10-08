/**
 * Начальные данные: роли по умолчанию, сезон ША 2026 с этапами, владелец.
 *
 * Можно запускать сколько угодно раз: всё через upsert, существующее не
 * ломается. Названия и права ролей после первого запуска правятся в
 * админке — сид их не перезаписывает, только создаёт недостающие.
 */
import { db } from "../lib/db";
import { normalizeEmail } from "../lib/auth/email-code";
import {
  DEFAULT_APPLICATION_CRITERIA,
  DEFAULT_APPLICATION_MARKERS,
  DEFAULT_APPLICATION_QUESTIONS,
  DEFAULT_ASSESSMENT_CRITERIA,
  DEFAULT_ASSESSMENT_MARKERS,
  DEFAULT_HOMEWORK_CRITERIA,
  DEFAULT_HOMEWORK_MARKERS,
  DEFAULT_INTERVIEW_CRITERIA,
  DEFAULT_INTERVIEW_MARKERS,
  type DefaultCriterion,
  type DefaultMarker,
} from "../lib/applications/defaults";
import { PERMISSION_GROUPS, PERMISSION_KEYS } from "../lib/permissions";
import { QUIZ_QUESTIONS } from "../app/games/quiz";

const selection = PERMISSION_GROUPS.find((group) => group.key === "selection")!.permissions.map(
  (permission) => permission.key,
);

const ROLES = [
  {
    slug: "master",
    name: "Мастер отбора",
    description: "Проверяет назначенные анкеты и отвечает кандидатам.",
    color: "#6152ff",
    priority: 10,
    // Все анкеты мастер видит только для чтения — чтобы сверяться с другими.
    permissions: ["applications.review", "applications.view_all", "messages.reply"],
  },
  {
    slug: "lead",
    name: "Главный организатор",
    description: "Ведёт отбор целиком: этапы, распределение, решения, команда.",
    color: "#d9f99d",
    priority: 50,
    permissions: [
      ...selection,
      "users.manage",
      "notifications.broadcast",
      "content.manage",
      "dashboards.view",
      "audit.view",
    ],
  },
  {
    slug: "admin",
    name: "Тех.админ",
    description: "Все права, включая настройку ролей.",
    color: "#16161d",
    priority: 100,
    permissions: [...PERMISSION_KEYS],
  },
];

const STAGES = [
  { kind: "APPLICATION", title: "Анкета", order: 1 },
  { kind: "HOMEWORK", title: "Домашнее задание", order: 2 },
  { kind: "ASSESSMENT", title: "Центр оценки", order: 3 },
  { kind: "INTERVIEW", title: "Собеседование", order: 4 },
  { kind: "RESULTS", title: "Итоги", order: 5 },
] as const;

/** Критерии и маркеры этапа — только если у этапа их ещё нет. */
async function seedEvaluation(
  seasonId: string,
  stageKind: "APPLICATION" | "HOMEWORK" | "ASSESSMENT" | "INTERVIEW",
  criteria: DefaultCriterion[],
  markers: DefaultMarker[],
) {
  if ((await db.criterion.count({ where: { seasonId, stageKind } })) === 0) {
    await db.criterion.createMany({
      data: criteria.map((criterion, index) => ({
        seasonId,
        stageKind,
        order: index + 1,
        title: criterion.title,
        badge: criterion.badge ?? null,
        description: criterion.description ?? null,
        maxScore: criterion.maxScore,
        levels: criterion.levels,
      })),
    });
  }

  if ((await db.marker.count({ where: { seasonId, stageKind } })) === 0) {
    await db.marker.createMany({
      data: markers.map((marker, index) => ({
        seasonId,
        stageKind,
        order: index + 1,
        title: marker.title,
        example: marker.example,
      })),
    });
  }
}

async function main() {
  for (const role of ROLES) {
    await db.role.upsert({
      where: { slug: role.slug },
      create: { ...role, isSystem: true },
      update: {},
    });
  }

  const season = await db.season.upsert({
    where: { slug: "sha-2026" },
    create: { slug: "sha-2026", title: "Школа Актива 2026", year: 2026, isCurrent: true },
    update: {},
  });

  for (const stage of STAGES) {
    await db.stage.upsert({
      where: { seasonId_kind: { seasonId: season.id, kind: stage.kind } },
      create: { ...stage, seasonId: season.id },
      update: {},
    });
  }

  // Анкета, критерии и маркеры — только если у сезона их ещё нет: правки
  // из админки сид не перезаписывает.
  if ((await db.formQuestion.count({ where: { seasonId: season.id, stageKind: "APPLICATION" } })) === 0) {
    await db.formQuestion.createMany({
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
        minLength: question.type === "LONG_TEXT" && (question.required ?? true) ? 200 : null,
      })),
    });
  }
  // Разделы-шаги анкеты — из названий у вопросов, в порядке первого вопроса.
  if ((await db.formSection.count({ where: { seasonId: season.id, stageKind: "APPLICATION" } })) === 0) {
    const titles = [...new Set(DEFAULT_APPLICATION_QUESTIONS.map((question) => question.section))];
    await db.formSection.createMany({
      data: titles.map((title, index) => ({ seasonId: season.id, stageKind: "APPLICATION" as const, order: index + 1, title })),
      skipDuplicates: true,
    });
  }

  await seedEvaluation(season.id, "APPLICATION", DEFAULT_APPLICATION_CRITERIA, DEFAULT_APPLICATION_MARKERS);
  await seedEvaluation(season.id, "HOMEWORK", DEFAULT_HOMEWORK_CRITERIA, DEFAULT_HOMEWORK_MARKERS);
  await seedEvaluation(season.id, "ASSESSMENT", DEFAULT_ASSESSMENT_CRITERIA, DEFAULT_ASSESSMENT_MARKERS);
  await seedEvaluation(season.id, "INTERVIEW", DEFAULT_INTERVIEW_CRITERIA, DEFAULT_INTERVIEW_MARKERS);

  // Вопросы викторины — только если их ещё нет: правки из админки сид
  // не перезаписывает.
  if ((await db.quizQuestion.count({ where: { seasonId: season.id } })) === 0) {
    await db.quizQuestion.createMany({
      data: QUIZ_QUESTIONS.map((question, index) => ({
        seasonId: season.id,
        order: index + 1,
        text: question.text,
        options: [question.answer, ...question.wrong],
        correct: 0,
        isActive: true,
      })),
    });
  }

  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (ownerEmail) {
    const email = normalizeEmail(ownerEmail);
    await db.user.upsert({
      where: { email },
      create: { email, isOwner: true },
      update: { isOwner: true },
    });
    // Первый вход владельца — по коду на почту: пароля у него ещё нет, а
    // приглашать его некому. Пароль потом задаётся себе же приглашением.
    console.log(`Владелец: ${email}. Первый вход — по коду на эту почту.`);
  }

  console.log("Готово: роли, сезон «Школа Актива 2026», этапы, анкета, критерии и маркеры.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
