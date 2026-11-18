import { db } from "~~/lib/db";
import type { Prisma } from "~~/lib/generated/prisma/client";
import { enqueueNotifications, notify } from "~~/lib/notifications/notify";
import { FINAL_STAGE } from "~~/lib/applications/decisions";

import { PARTICIPATION_PATH, PARTICIPATION_SUCCESS, type participationSchema, questionsSchema, type Questions } from "./form";
import type { z } from "zod";

export const shaAccepted = {
  status: "SUBMITTED",
  decisions: { some: { stageKind: FINAL_STAGE, outcome: "PASSED" } },
} satisfies Prisma.ApplicationWhereInput;

export function participationAudience(seasonId: string) {
  return { ...shaAccepted, seasonId, user: { status: "ACTIVE" }, participation: null } satisfies Prisma.ApplicationWhereInput;
}

export async function inviteToParticipation(params: { seasonId: string; title: string; body: string | null; questions: Questions }) {
  return db.$transaction(async (tx) => {
    const candidates = await tx.application.findMany({
      where: participationAudience(params.seasonId),
      select: { id: true, userId: true },
      orderBy: { id: "asc" },
    });
    const invited = await tx.participation.createManyAndReturn({
      data: candidates.map(({ id }) => ({ applicationId: id, questions: params.questions })),
      skipDuplicates: true,
      select: { applicationId: true },
    });
    const invitedIds = new Set(invited.map(({ applicationId }) => applicationId));
    return enqueueNotifications(tx, candidates.filter(({ id }) => invitedIds.has(id)).map(({ id, userId }) => ({
      userId, category: "SYSTEM", title: params.title, body: params.body,
      url: PARTICIPATION_PATH, key: `sha-participation:${id}:invite`,
    })), { forceTelegram: true, urgent: true });
  }, { timeout: 20_000 });
}

function ownParticipation(seasonId: string, userId: string) {
  return { application: { ...shaAccepted, seasonId, userId, user: { status: "ACTIVE" } } } satisfies Prisma.ParticipationWhereInput;
}

export async function loadParticipation(seasonId: string, userId: string) {
  const record = await db.participation.findFirst({
    where: ownParticipation(seasonId, userId),
    select: {
      questions: true, submittedAt: true, attending: true, scanMime: true,
      application: { select: { lastName: true, firstName: true, middleName: true, user: { select: { faculty: true, studentId: true } }, studentId: true } },
    },
  });
  if (!record) return null;
  return {
    questions: questionsSchema.parse(record.questions),
    submitted: record.submittedAt !== null,
    attending: record.attending,
    scanReceived: record.scanMime !== null,
    name: [record.application.lastName, record.application.firstName, record.application.middleName].filter(Boolean).join(" "),
    faculty: record.application.user.faculty,
    studentId: record.application.studentId || record.application.user.studentId,
  };
}

export async function submitParticipation(seasonId: string, userId: string, answers: z.infer<typeof participationSchema>) {
  const own = ownParticipation(seasonId, userId);
  const record = await db.participation.findFirst({
    where: own,
    select: { applicationId: true, submittedAt: true, scanMime: true },
  });
  if (!record) return { ok: false, message: "Анкета доступна после приглашения организаторов." };
  if (record.submittedAt) return { ok: true, message: PARTICIPATION_SUCCESS };

  const needsScan = answers.attending && answers.minor;
  if (needsScan && !record.scanMime) return { ok: false, message: "Сначала пришлите подписанное заявление в Telegram и проверьте, что бот принял файл." };

  const saved = await db.participation.updateMany({
    where: { ...own, applicationId: record.applicationId, submittedAt: null, ...(needsScan ? { scanMime: { not: null } } : {}) },
    data: {
      submittedAt: new Date(), attending: answers.attending, answers,
      ...(!needsScan ? { consentScan: null, scanMime: null } : {}),
    },
  });
  if (!saved.count && !await db.participation.count({ where: { ...own, submittedAt: { not: null } } })) {
    return { ok: false, message: "Анкету не удалось отправить. Обновите страницу и попробуйте ещё раз." };
  }
  return { ok: true, message: PARTICIPATION_SUCCESS };
}

const moscowDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" });

export async function materializeParticipationReminders(now = new Date()) {
  const day = moscowDay.format(now);
  const due = new Date(`${day}T09:00:00+03:00`);
  if (now < due) return 0;
  const pending = await db.participation.findMany({
    where: {
      submittedAt: null, invitedAt: { lt: due },
      application: { ...shaAccepted, season: { isCurrent: true }, user: { status: "ACTIVE" } },
    },
    select: { applicationId: true, application: { select: { userId: true } } },
  });
  return notify(pending.map(({ applicationId, application }) => ({
    userId: application.userId,
    category: "SYSTEM",
    title: "Заполни анкету участника Школы Актива",
    body: "Пожалуйста, заполни и отправь анкету в личном кабинете, чтобы подтвердить участие в Школе Актива.",
    url: PARTICIPATION_PATH,
    key: `sha-participation:${applicationId}:${day}`,
  })), { forceTelegram: true, telegramOnly: true, deliverAt: now });
}

export const participationNotification = (key: string | null) => /^sha-participation:([a-z0-9-]+):(invite|\d{4}-\d{2}-\d{2})$/.exec(key ?? "");

export async function participationNotificationIsCurrent(match: RegExpExecArray, userId: string, now: Date) {
  const [, applicationId, occurrence] = match;
  if (occurrence !== "invite" && occurrence !== moscowDay.format(now)) return false;
  return Boolean(await db.participation.count({
    where: { applicationId, submittedAt: null, application: { ...shaAccepted, userId, season: { isCurrent: true } } },
  }));
}
