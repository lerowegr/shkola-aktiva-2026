import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { stageState, type StageState } from "~~/lib/stages";
import { savePdf } from "~~/lib/uploads";

import { assignFollowUp } from "./assign";
import { candidateDecision } from "./decisions";
import { notifyAssigned } from "./notifications";

/**
 * Домашнее задание глазами кандидата и его сдача.
 *
 * Сдать может только тот, кто прошёл анкету (решение опубликовано), и
 * только пока этап открыт. Пересдать можно до дедлайна: новая версия
 * становится текущей, старая остаётся в истории — мастер видит обе.
 */
export const HOMEWORK_TEXT_MAX = 2000;

export interface HomeworkView {
  state: StageState;
  opensAt: Date | null;
  closesAt: Date | null;
  task: string | null;
  /** Решение по анкете: проходит ли человек на ДЗ. null — ещё не объявлено. */
  admission: "PASSED" | "REJECTED" | null;
  submissions: {
    id: string;
    submittedAt: Date;
    text: string | null;
    file: { id: string; filename: string; size: number } | null;
    current: boolean;
  }[];
  canSubmit: boolean;
}

export async function loadHomework(userId: string): Promise<HomeworkView | null> {
  const season = await db.season.findFirst({
    where: { isCurrent: true },
    select: {
      id: true,
      stages: { where: { kind: "HOMEWORK" }, select: { mode: true, opensAt: true, closesAt: true, description: true } },
    },
  });
  const stage = season?.stages[0];
  if (!season || !stage) return null;

  const [admission, application] = await Promise.all([
    candidateDecision(userId, season.id, "APPLICATION"),
    db.application.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId } },
      select: {
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
    }),
  ]);

  const state = stageState(stage);

  return {
    state,
    opensAt: stage.opensAt,
    closesAt: stage.closesAt,
    // Текст задания — только допущенным: остальным он ни к чему.
    task: admission === "PASSED" ? stage.description : null,
    admission,
    submissions: (application?.submissions ?? []).map((item) => ({
      id: item.id,
      submittedAt: item.submittedAt,
      text: item.text,
      file: item.upload,
      current: item.replacedAt === null,
    })),
    canSubmit: admission === "PASSED" && state === "open",
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
  if (!view) return { ok: false, message: "Этап домашнего задания ещё не заведён." };
  if (view.admission !== "PASSED") {
    return { ok: false, message: "Домашнее задание сдают те, кто прошёл этап анкеты." };
  }
  if (view.state === "upcoming") return { ok: false, message: "Приём домашних заданий ещё не открыт." };
  if (view.state === "closed") return { ok: false, message: "Приём домашних заданий уже закрыт." };

  const text = params.text?.trim() || null;
  if (!params.file && !text) return { ok: false, message: "Прикрепите PDF или напишите ответ." };
  if (text && text.length > HOMEWORK_TEXT_MAX) {
    return { ok: false, message: `Комментарий не длиннее ${HOMEWORK_TEXT_MAX} знаков.` };
  }

  const application = await db.application.findFirst({
    where: { userId: params.userId, season: { isCurrent: true } },
    select: { id: true },
  });
  if (!application) return { ok: false, message: "Анкета не найдена." };

  let uploadId: string | null = null;
  if (params.file) {
    const saved = await savePdf({ userId: params.userId, filename: params.file.filename, data: params.file.data });
    if (!saved.ok) return saved;
    uploadId = saved.uploadId;
  }

  const now = new Date();
  const submission = await db.$transaction(async (tx) => {
    await tx.submission.updateMany({
      where: { applicationId: application.id, stageKind: "HOMEWORK", replacedAt: null },
      data: { replacedAt: now },
    });
    return tx.submission.create({
      data: { applicationId: application.id, stageKind: "HOMEWORK", uploadId, text, via: params.via, submittedAt: now },
      select: { id: true },
    });
  });

  const resubmission = view.submissions.length > 0;
  const review = await assignFollowUp(application.id, "HOMEWORK");
  if (review && !resubmission) await notifyAssigned([review.id], "HOMEWORK");

  await notify([
    {
      userId: params.userId,
      category: "SELECTION",
      title: resubmission ? "Новая версия домашнего задания получена" : "Домашнее задание получено",
      body: "Его уже проверяет мастер отбора. Пересдать можно до дедлайна.",
      url: "/cabinet/homework",
      key: `submission:${submission.id}`,
    },
  ]);

  return { ok: true, message: resubmission ? "Новая версия сдана — проверят её." : "Домашнее задание сдано!" };
}
