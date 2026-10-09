import { db } from "~~/lib/db";
import { suggestAnswers } from "~~/lib/profile/onboarding";
import { stageState, type StageState } from "~~/lib/stages";

import type { AnswerValue } from "./form";

/**
 * Анкета глазами кандидата: вопросы текущего сезона, его ответы и можно ли
 * сейчас что-то менять. Баллов, маркеров и комментариев здесь нет и быть
 * не должно — кандидат их не видит никогда.
 */

export interface CandidateQuestion {
  id: string;
  section: string;
  type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "URL";
  label: string;
  help: string | null;
  required: boolean;
  options: string[];
  maxLength: number | null;
  minLength: number | null;
  format: "DIGITS" | "GROUP" | "PHONE" | "VK" | "TELEGRAM" | null;
}

/** Раздел анкеты — шаг: название и описание. */
export interface CandidateSection {
  title: string;
  description: string | null;
}

export interface CandidateApplication {
  seasonTitle: string;
  stage: { state: StageState; opensAt: Date | null; closesAt: Date | null };
  questions: CandidateQuestion[];
  /** Шаги в порядке разделов; в каждом — только те, где есть вопросы. */
  sections: CandidateSection[];
  application: {
    id: string | null;
    status: "DRAFT" | "SUBMITTED";
    submittedAt: Date | null;
    profile: { lastName: string; firstName: string; middleName: string; studentId: string };
    answers: Record<string, AnswerValue>;
  };
  /** Можно ли сейчас править и отправлять. */
  editable: boolean;
}

export async function currentApplicationStage() {
  const season = await db.season.findFirst({
    where: { isCurrent: true },
    select: {
      id: true,
      title: true,
      stages: {
        where: { kind: "APPLICATION" },
        select: { mode: true, opensAt: true, closesAt: true },
      },
    },
  });

  if (!season) return null;
  const stage = season.stages[0] ?? { mode: "CLOSED" as const, opensAt: null, closesAt: null };

  return {
    seasonId: season.id,
    seasonTitle: season.title,
    stage: { state: stageState(stage), opensAt: stage.opensAt, closesAt: stage.closesAt },
  };
}

export async function applicationQuestions(seasonId: string): Promise<CandidateQuestion[]> {
  return db.formQuestion.findMany({
    where: { seasonId, stageKind: "APPLICATION" },
    orderBy: { order: "asc" },
    select: {
      id: true,
      section: true,
      type: true,
      label: true,
      help: true,
      required: true,
      options: true,
      maxLength: true,
      minLength: true,
      format: true,
    },
  });
}

/**
 * Разделы-шаги в порядке. Вопрос с разделом, которого нет в таблице
 * (переименовали раньше, чем появились разделы), — отдельным шагом в конце:
 * ответ не должен потеряться.
 */
export async function applicationSections(seasonId: string, questions: readonly { section: string }[]): Promise<CandidateSection[]> {
  const rows = await db.formSection.findMany({
    where: { seasonId, stageKind: "APPLICATION" },
    orderBy: { order: "asc" },
    select: { title: true, description: true },
  });
  const used = new Set(questions.map((question) => question.section));
  const sections = rows.filter((row) => used.has(row.title));
  for (const title of used) {
    if (!sections.some((section) => section.title === title)) sections.push({ title, description: null });
  }
  return sections;
}

export async function loadCandidateApplication(userId: string): Promise<CandidateApplication | null> {
  const current = await currentApplicationStage();
  if (!current) return null;

  const [questions, application, user] = await Promise.all([
    applicationQuestions(current.seasonId),
    db.application.findUnique({
      where: { seasonId_userId: { seasonId: current.seasonId, userId } },
      include: { answers: { select: { questionId: true, value: true } } },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, middleName: true, studentId: true, course: true, faculty: true, phone: true },
    }),
  ]);

  const status = application?.status ?? "DRAFT";

  return {
    seasonTitle: current.seasonTitle,
    stage: current.stage,
    questions,
    sections: await applicationSections(current.seasonId, questions),
    application: {
      id: application?.id ?? null,
      status,
      submittedAt: application?.submittedAt ?? null,
      // Чего в анкете ещё нет — из знакомства (а имя — из Telegram): меньше
      // печатать. Отправка берёт то же самое (profileForSubmit).
      profile: {
        lastName: application?.lastName ?? user?.lastName ?? "",
        firstName: application?.firstName ?? user?.firstName ?? "",
        middleName: application?.middleName ?? user?.middleName ?? "",
        studentId: application?.studentId ?? user?.studentId ?? "",
      },
      answers: {
        ...(status === "DRAFT" && user ? suggestAnswers(questions, user) : {}),
        ...Object.fromEntries((application?.answers ?? []).map((answer) => [answer.questionId, answer.value as AnswerValue])),
      },
    },
    editable: status === "DRAFT" && current.stage.state === "open",
  };
}

/**
 * Черновик кандидата: создаётся при первом сохранении, а не при просмотре.
 *
 * Первые ответы летят пачкой одновременно, и два upsert-а гоняются за одну
 * строку: второй падает на уникальности (seasonId, userId), и его ответ
 * терялся. Проигравший просто перечитывает созданный черновик.
 */
export async function draftFor(userId: string, seasonId: string) {
  const where = { seasonId_userId: { seasonId, userId } };
  const select = { id: true, status: true } as const;
  try {
    return await db.application.upsert({ where, create: { seasonId, userId }, update: {}, select });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return db.application.findUniqueOrThrow({ where, select });
  }
}
