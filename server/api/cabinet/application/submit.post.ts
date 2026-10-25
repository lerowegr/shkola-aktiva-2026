import { z } from "zod";

import { assignApplication, assignFollowUp } from "~~/lib/applications/assign";
import { applicationQuestions, applicationSections } from "~~/lib/applications/candidate";
import { homeworkText } from "~~/lib/applications/homework";
import { notifyAssigned, notifySubmitted } from "~~/lib/applications/notifications";
import { formatValue, normalizeUrl, submitProblems } from "~~/lib/applications/form";
import { autoInvite } from "~~/lib/assessment/sessions";
import { db } from "~~/lib/db";
import { suggestAnswers } from "~~/lib/profile/onboarding";
import { editableDraft } from "~~/server/utils/application-guard";
import { requireProfile } from "~~/server/utils/session";

/**
 * Отправить анкету.
 *
 * Домашнее задание — раздел анкеты: его ответы (ссылки на работы)
 * проверяются как остальные вопросы, а при отправке становятся сдачей ДЗ.
 *
 * После отправки анкета только для чтения и сразу уходит мастеру с
 * наименьшей нагрузкой; домашка — тому же мастеру на проверку ДЗ. Если мастеров ещё нет, она подождёт: главный
 * организатор раздаст её кнопкой «Распределить».
 */
export default defineAction(z.object({}), async ({ event }) => {
  const user = await requireProfile(event);
  const draft = await editableDraft(user);
  if (!draft.ok) return draft;

  const [questions, application, person] = await Promise.all([
    applicationQuestions(draft.seasonId),
    db.application.findUniqueOrThrow({
      where: { id: draft.applicationId },
      include: { answers: { select: { id: true, questionId: true, value: true } } },
    }),
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true, middleName: true, studentId: true, course: true, faculty: true, phone: true },
    }),
  ]);

  // Чего человек в анкете не трогал, форма подставила из знакомства — если
  // в анкете этого ещё нет, берём то же, что он видел.
  const profile = {
    lastName: application.lastName ?? person.lastName,
    firstName: application.firstName ?? person.firstName,
    middleName: application.middleName ?? person.middleName,
    studentId: application.studentId ?? person.studentId,
  };
  const suggested = suggestAnswers(questions, person);
  const known = new Set(application.answers.map((answer) => answer.questionId));
  const filled = Object.entries(suggested).filter(([questionId]) => !known.has(questionId));

  const sections = await applicationSections(application.seasonId, questions);
  const homeworkSections = new Set(sections.filter((section) => section.homework).map((section) => section.title));

  const answers = {
    ...Object.fromEntries(filled),
    ...Object.fromEntries(application.answers.map((answer) => [answer.questionId, answer.value])),
  };
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
    if (filled.length) {
      await tx.answer.createMany({
        data: filled.map(([questionId, value]) => ({ applicationId: application.id, questionId, value })),
        skipDuplicates: true,
      });
    }
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
        middleName: profile.middleName,
        ...(studentId.ok ? { studentId: studentId.value } : {}),
      },
    });

    // Ответы раздела «Домашнее задание» — сдача ДЗ: по ней работа попадает
    // в «Оценку ДЗ», к решениям и в рассылки.
    const homework = homeworkText(questions, homeworkSections, answers);
    if (homework) {
      await tx.submission.updateMany({
        where: { applicationId: application.id, stageKind: "HOMEWORK", replacedAt: null },
        data: { replacedAt: new Date() },
      });
      await tx.submission.create({ data: { applicationId: application.id, stageKind: "HOMEWORK", text: homework, via: "SITE" } });
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
  // Домашка ушла вместе с анкетой — сразу на проверку, тому же мастеру.
  const homeworkReview = homeworkSections.size ? await assignFollowUp(application.id, "HOMEWORK") : null;

  await notifySubmitted(application.id, user.id);
  await autoInvite(application.id);
  if (review) await notifyAssigned([review.id]);
  if (homeworkReview) await notifyAssigned([homeworkReview.id], "HOMEWORK");

  return { ok: true, message: "Анкета отправлена!" };
});
