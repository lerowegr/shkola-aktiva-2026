import { z } from "zod";

import { db } from "~~/lib/db";
import { editableDraft } from "~~/server/utils/application-guard";
import { requireProfile } from "~~/server/utils/session";

const text = (max: number, label: string) =>
  z.string().max(max, `${label}: не длиннее ${max} знаков.`).optional();

const schema = z.object({
  lastName: text(60, "Фамилия"),
  firstName: text(60, "Имя"),
  middleName: text(60, "Отчество"),
  studentId: text(30, "Студенческий билет"),
});

/**
 * Автосохранение ФИО и студбилета.
 *
 * Имя и фамилию заодно переносим в профиль человека: в Telegram люди
 * подписываются как угодно, а в анкете — как в паспорте, и во всех списках
 * кабинетов лучше видеть второе.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireProfile(event);
  const draft = await editableDraft(user);
  if (!draft.ok) return draft;

  const data = Object.fromEntries(
    Object.entries(body)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, (value as string).trim() || null]),
  );

  await db.application.update({ where: { id: draft.applicationId }, data });

  const person: { firstName?: string; lastName?: string } = {};
  if (typeof data.firstName === "string") person.firstName = data.firstName;
  if (typeof data.lastName === "string") person.lastName = data.lastName;
  if (Object.keys(person).length > 0) await db.user.update({ where: { id: user.id }, data: person });

  return { ok: true, savedAt: new Date().toISOString() };
});
