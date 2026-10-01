import { db } from "~~/lib/db";
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
}

export interface CandidateApplication {
  seasonTitle: string;
  stage: { state: StageState; opensAt: Date | null; closesAt: Date | null };
  questions: CandidateQuestion[];
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
    },
  });
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
    db.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
  ]);

  const status = application?.status ?? "DRAFT";

  return {
    seasonTitle: current.seasonTitle,
    stage: current.stage,
    questions,
    application: {
      id: application?.id ?? null,
      status,
      submittedAt: application?.submittedAt ?? null,
      // Пока анкеты нет, подставляем имя из Telegram — меньше печатать.
      profile: {
        lastName: application?.lastName ?? user?.lastName ?? "",
        firstName: application?.firstName ?? user?.firstName ?? "",
        middleName: application?.middleName ?? "",
        studentId: application?.studentId ?? "",
      },
      answers: Object.fromEntries(
        (application?.answers ?? []).map((answer) => [answer.questionId, answer.value as AnswerValue]),
      ),
    },
    editable: status === "DRAFT" && current.stage.state === "open",
  };
}

/** Черновик кандидата: создаётся при первом сохранении, а не при просмотре. */
export async function draftFor(userId: string, seasonId: string) {
  return db.application.upsert({
    where: { seasonId_userId: { seasonId, userId } },
    create: { seasonId, userId },
    update: {},
    select: { id: true, status: true },
  });
}
