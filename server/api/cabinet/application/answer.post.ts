import { z } from "zod";

import { normalizeAnswer, isEmptyAnswer } from "~~/lib/applications/form";
import { db } from "~~/lib/db";
import { editableDraft } from "~~/server/utils/application-guard";
import { requireProfile } from "~~/server/utils/session";

const schema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.string(), z.array(z.string())]),
});

/**
 * Автосохранение одного ответа. Вызывается на каждую паузу в наборе,
 * поэтому в аудит не пишется: кандидат правит свой черновик, а не чужие
 * данные. В журнал попадает отправка анкеты.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireProfile(event);
  const draft = await editableDraft(user);
  if (!draft.ok) return draft;

  const question = await db.formQuestion.findFirst({
    where: { id: body.questionId, seasonId: draft.seasonId, stageKind: "APPLICATION" },
    select: { id: true, label: true, type: true, required: true, options: true, maxLength: true },
  });
  if (!question) return { ok: false, message: "Вопрос не найден — обновите страницу." };

  const normalized = normalizeAnswer(question, body.value);
  if (!normalized.ok) return normalized;

  const key = { applicationId_questionId: { applicationId: draft.applicationId, questionId: question.id } };

  if (isEmptyAnswer(normalized.value)) {
    await db.answer.deleteMany({ where: { applicationId: draft.applicationId, questionId: question.id } });
  } else {
    await db.answer.upsert({
      where: key,
      create: { applicationId: draft.applicationId, questionId: question.id, value: normalized.value },
      update: { value: normalized.value },
    });
  }

  return { ok: true, savedAt: new Date().toISOString() };
});
