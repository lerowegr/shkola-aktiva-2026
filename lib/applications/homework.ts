import { db } from "~~/lib/db";
import { stageState, type StageState } from "~~/lib/stages";
import { savePdf } from "~~/lib/uploads";

import { draftFor } from "./candidate";
import { candidateDecision } from "./decisions";

/**
 * Домашнее задание — часть анкеты.
 *
 * Задание показывается последним шагом анкеты, сдаётся PDF и/или текстом,
 * пока анкета — черновик и приём анкет открыт. Без сданного ДЗ анкета не
 * отправляется. После отправки анкеты домашка, как и ответы, не меняется.
 * Новая версия до отправки заменяет прежнюю, старая остаётся в истории.
 *
 * Проверка ДЗ — отдельная оценка (этап HOMEWORK): мастер назначается при
 * отправке анкеты (submit.post.ts). Текст задания — описание этапа
 * «Домашнее задание» в «Этапах».
 */
export const HOMEWORK_TEXT_MAX = 2000;

export interface HomeworkView {
  /** Состояние приёма анкет: домашка сдаётся вместе с ней. */
  state: StageState;
  closesAt: Date | null;
  task: string | null;
  submissions: {
    id: string;
    submittedAt: Date;
    text: string | null;
    file: { id: string; filename: string; size: number } | null;
    current: boolean;
  }[];
  /** Можно сдать или заменить: анкета — черновик, приём открыт. */
  canSubmit: boolean;
  /** Анкета отправлена — домашка ушла вместе с ней. */
  sent: boolean;
  /** Опубликованное решение по анкете (вместе с домашкой). */
  admission: "PASSED" | "REJECTED" | null;
}

export async function loadHomework(userId: string): Promise<HomeworkView | null> {
  const season = await db.season.findFirst({
    where: { isCurrent: true },
    select: {
      id: true,
      stages: {
        where: { kind: { in: ["APPLICATION", "HOMEWORK"] } },
        select: { kind: true, mode: true, opensAt: true, closesAt: true, description: true },
      },
    },
  });
  const applicationStage = season?.stages.find((stage) => stage.kind === "APPLICATION");
  const homeworkStage = season?.stages.find((stage) => stage.kind === "HOMEWORK");
  if (!season || !applicationStage) return null;

  const admission = await candidateDecision(userId, season.id, "APPLICATION");
  const application = await db.application.findUnique({
    where: { seasonId_userId: { seasonId: season.id, userId } },
    select: {
      status: true,
      submissions: {
        where: { stageKind: "HOMEWORK" },
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          submittedAt: true,
          text: true,
          replacedAt: true,
          upload: { select: { id: true, filename: true, size: true } },
        },
      },
    },
  });

  const state = stageState(applicationStage);
  const sent = application?.status === "SUBMITTED";

  return {
    state,
    closesAt: applicationStage.closesAt,
    task: homeworkStage?.description?.trim() || null,
    submissions: (application?.submissions ?? []).map((item) => ({
      id: item.id,
      submittedAt: item.submittedAt,
      text: item.text,
      file: item.upload,
      current: item.replacedAt === null,
    })),
    canSubmit: !sent && state === "open",
    sent,
    admission,
  };
}

export type SubmitResult = { ok: true; message: string } | { ok: false; message: string };

export async function submitHomework(params: {
  userId: string;
  file: { filename: string; data: Uint8Array } | null;
  text: string | null;
  via: "SITE" | "TELEGRAM";
}): Promise<SubmitResult> {
  const view = await loadHomework(params.userId);
  if (!view) return { ok: false, message: "Отбор ещё не заведён." };
  if (view.sent) return { ok: false, message: "Анкета уже отправлена — домашнее задание ушло вместе с ней и больше не меняется." };
  if (view.state === "upcoming") return { ok: false, message: "Приём анкет ещё не открыт — домашку сдают вместе с анкетой." };
  if (view.state === "closed") return { ok: false, message: "Приём анкет закрыт — сдать домашнее задание уже нельзя." };

  const text = params.text?.trim() || null;
  if (!params.file && !text) return { ok: false, message: "Прикрепите PDF или напишите ответ." };
  if (text && text.length > HOMEWORK_TEXT_MAX) {
    return { ok: false, message: `Ответ не длиннее ${HOMEWORK_TEXT_MAX} знаков.` };
  }

  const season = await db.season.findFirstOrThrow({ where: { isCurrent: true }, select: { id: true } });
  const application = await draftFor(params.userId, season.id);
  if (application.status !== "DRAFT") return { ok: false, message: "Анкета уже отправлена — домашнее задание больше не меняется." };

  let uploadId: string | null = null;
  if (params.file) {
    const saved = await savePdf({ userId: params.userId, filename: params.file.filename, data: params.file.data });
    if (!saved.ok) return saved;
    uploadId = saved.uploadId;
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.submission.updateMany({
      where: { applicationId: application.id, stageKind: "HOMEWORK", replacedAt: null },
      data: { replacedAt: now },
    });
    await tx.submission.create({
      data: { applicationId: application.id, stageKind: "HOMEWORK", uploadId, text, via: params.via, submittedAt: now },
    });
  });

  const resubmission = view.submissions.length > 0;
  return {
    ok: true,
    message: resubmission
      ? "Новая версия прикреплена. Осталось отправить анкету."
      : "Домашнее задание прикреплено. Осталось отправить анкету.",
  };
}

/** Есть ли у черновика сданная домашка — без неё анкета не уходит. */
export async function hasHomework(applicationId: string): Promise<boolean> {
  return (await db.submission.count({ where: { applicationId, stageKind: "HOMEWORK", replacedAt: null } })) > 0;
}
