import { loadCandidateAssessment } from "~~/lib/assessment/candidate";
import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";

import { fullName } from "./staff";

/**
 * Уведомления вокруг анкеты: кандидату — что отправлена, мастеру — что
 * назначена. Ключи событий не дают задвоить уведомление, если обработчик
 * вызвали повторно.
 */
/**
 * Анкета отправлена. Если для факультета кандидата уже открыты даты центра
 * оценки — сразу зовём выбрать дату: это следующий шаг.
 */
export async function notifySubmitted(applicationId: string, userId: string) {
  const assessment = await loadCandidateAssessment(userId).catch(() => null);
  const choose = (assessment?.options.length ?? 0) > 0;
  await notify([
    {
      userId,
      category: "SELECTION",
      title: choose ? "Анкета отправлена — выберите дату центра оценки" : "Анкета отправлена",
      body: choose
        ? "Анкета и домашнее задание у нас. Следующий шаг — центр оценки: выберите удобную дату в кабинете, пока есть места."
        : "Её уже читает мастер отбора. О дате центра оценки сообщим здесь.",
      url: choose ? "/cabinet/assessment" : "/cabinet",
      key: `application:${applicationId}:submitted`,
    },
  ]);
}

const ASSIGNED_TITLE = {
  APPLICATION: "Вам назначена анкета",
  HOMEWORK: "Вам назначено домашнее задание",
  ASSESSMENT: "Вам назначена группа центра оценки",
  INTERVIEW: "Вам назначено собеседование",
  RESULTS: "Вам назначена работа",
} as const;

export async function notifyAssigned(reviewIds: string[], stage: keyof typeof ASSIGNED_TITLE = "APPLICATION") {
  if (reviewIds.length === 0) return;

  const reviews = await db.review.findMany({
    where: { id: { in: reviewIds } },
    select: {
      id: true,
      reviewerId: true,
      applicationId: true,
      application: { select: { lastName: true, firstName: true, middleName: true } },
    },
  });

  await notify(
    reviews.map((review) => ({
      userId: review.reviewerId,
      category: "REVIEW" as const,
      title: ASSIGNED_TITLE[stage],
      body: fullName(review.application),
      url: `/staff/applications/${review.applicationId}${stage === "APPLICATION" ? "" : `?stage=${stage}`}`,
      // Переназначенная анкета — новое событие для нового мастера.
      key: `review:${review.id}:${review.reviewerId}`,
    })),
  );
}
