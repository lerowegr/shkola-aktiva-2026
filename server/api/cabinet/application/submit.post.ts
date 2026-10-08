import { z } from "zod";

import { assignApplication } from "~~/lib/applications/assign";
import { applicationQuestions } from "~~/lib/applications/candidate";
import { notifyAssigned, notifySubmitted } from "~~/lib/applications/notifications";
import { formatValue, normalizeUrl, submitProblems } from "~~/lib/applications/form";
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

  const [questions, application, person] = await Promise.all([
    applicationQuestions(draft.seasonId),
    db.application.findUniqueOrThrow({
      where: { id: draft.applicationId },
      include: { answers: { select: { id: true, questionId: true, value: true } } },
    }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { firstName: true, lastName: true } }),
  ]);

  // Имя и фамилию форма подставляет из профиля (Telegram) — если человек их
  // не трогал, в анкете их ещё нет. Берём те же, что он видел.
  const profile = {
    lastName: application.lastName ?? person.lastName,
    firstName: application.firstName ?? person.firstName,
    studentId: application.studentId,
  };

  const answers = Object.fromEntries(application.answers.map((answer) => [answer.questionId, answer.value]));
  const problems = submitProblems(questions, answers, profile);

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

  // Приводим к единому виду: «vk.com/id1» → «https://vk.ru/id1», телефон —
  // +7 (XXX) XXX-XX-XX, — чтобы мастер видел одинаковое и открывал ссылку
  // одним нажатием.
  const byId = new Map(questions.map((question) => [question.id, question]));

  await db.$transaction(async (tx) => {
    for (const answer of application.answers) {
      const question = byId.get(answer.questionId);
      if (!question || typeof answer.value !== "string") continue;
      let value: string | null = null;
      if (question.format) {
        const formatted = formatValue(question.format, answer.value);
        if (formatted.ok) value = formatted.value;
      } else if (question.type === "URL") {
        value = normalizeUrl(answer.value);
      }
      if (value && value !== answer.value) await tx.answer.update({ where: { id: answer.id }, data: { value } });
    }

    const studentId = formatValue("DIGITS", application.studentId ?? "");
    await tx.application.update({
      where: { id: application.id },
      data: {
        lastName: profile.lastName,
        firstName: profile.firstName,
        ...(studentId.ok ? { studentId: studentId.value } : {}),
      },
    });

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
