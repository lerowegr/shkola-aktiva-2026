import { z } from "zod";

import { assignApplication } from "~~/lib/applications/assign";
import { applicationQuestions } from "~~/lib/applications/candidate";
import { notifyAssigned, notifySubmitted } from "~~/lib/applications/notifications";
import { normalizeUrl, submitProblems } from "~~/lib/applications/form";
import { db } from "~~/lib/db";
import { editableDraft } from "~~/server/utils/application-guard";
import { requireSignedIn } from "~~/server/utils/session";

/**
 * Отправить анкету.
 *
 * После отправки анкета только для чтения и сразу уходит мастеру с
 * наименьшей нагрузкой. Если мастеров ещё нет, она подождёт: главный
 * организатор раздаст её кнопкой «Распределить».
 */
export default defineAction(z.object({}), async ({ event }) => {
  const user = await requireSignedIn(event);
  const draft = await editableDraft(user);
  if (!draft.ok) return draft;

  const [questions, application] = await Promise.all([
    applicationQuestions(draft.seasonId),
    db.application.findUniqueOrThrow({
      where: { id: draft.applicationId },
      include: { answers: { select: { id: true, questionId: true, value: true } } },
    }),
  ]);

  const answers = Object.fromEntries(application.answers.map((answer) => [answer.questionId, answer.value]));
  const problems = submitProblems(questions, answers, application);

  if (problems.length > 0) {
    return {
      ok: false,
      message:
        problems.length === 1
          ? problems[0]!.message
          : `Осталось заполнить: ${problems.length}. ${problems[0]!.message}`,
      problems,
    };
  }

  // Ссылки приводим к полному виду: «vk.com/id1» → «https://vk.com/id1»,
  // чтобы мастер открывал их одним нажатием.
  const urlQuestions = new Set(questions.filter((question) => question.type === "URL").map((q) => q.id));

  await db.$transaction(async (tx) => {
    for (const answer of application.answers) {
      if (!urlQuestions.has(answer.questionId) || typeof answer.value !== "string") continue;
      const url = normalizeUrl(answer.value);
      if (url && url !== answer.value) await tx.answer.update({ where: { id: answer.id }, data: { value: url } });
    }

    // Условие status: DRAFT — вторая одновременная отправка ничего не сделает.
    await tx.application.updateMany({
      where: { id: application.id, status: "DRAFT" },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  });

  await audit(event, {
    actorId: user.id,
    action: "application.submit",
    entityType: "application",
    entityId: application.id,
  });

  const review = await assignApplication(application.id, "APPLICATION", null);

  await notifySubmitted(application.id, user.id);
  if (review) await notifyAssigned([review.id]);

  return { ok: true, message: "Анкета отправлена!" };
});
