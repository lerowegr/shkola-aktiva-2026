import { writeAudit } from "~~/lib/audit";
import { inviteSession } from "~~/lib/assessment/sessions";
import { canChangeAnswer, invitesFaculty, placeChanged, placeOf, placeProblem, readPlace, slotStartsAt } from "~~/lib/assessment/rules";
import { db } from "~~/lib/db";
import { suggestAnswers } from "~~/lib/profile/onboarding";
import { stageState } from "~~/lib/stages";

import { assignApplication, assignFollowUp } from "./assign";
import { applicationQuestions, applicationSections } from "./candidate";
import { normalizeUrl, type AnswerValue } from "./form";
import { homeworkText } from "./homework";

type AcceptResult =
  | { ok: false; message: string }
  | { ok: true; applicationId: string; homeworkPresent: boolean; invited: boolean; reviewAssigned: boolean; auditRecorded: boolean; message: string };

/** Адресное решение организатора: не выдаём его за отправку кандидатом. */
export async function acceptApplicationByStaff(
  params: { seasonId: string; userId: string; actorId: string; sessionId: string },
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<AcceptResult> {
  const [application, session, questions] = await Promise.all([
    db.application.findFirst({
      where: { seasonId: params.seasonId, userId: params.userId, season: { isCurrent: true }, status: "DRAFT", user: { status: "ACTIVE", isOwner: false, roles: { none: {} } } },
      include: { answers: true, submissions: { where: { stageKind: "HOMEWORK", replacedAt: null }, select: { id: true } }, user: { select: { firstName: true, lastName: true, middleName: true, studentId: true, course: true, faculty: true, phone: true } }, assessmentInvite: { select: { id: true } } },
    }),
    db.assessmentSession.findFirst({ where: { id: params.sessionId, seasonId: params.seasonId, reserve: false }, select: { id: true, title: true, startsAt: true, building: true, room: true, note: true, faculties: true, reserve: true, invited: true, invitedAt: true } }),
    applicationQuestions(params.seasonId),
  ]);
  if (!application) return { ok: false, message: "Активный кандидат с черновиком текущего сезона не найден или анкета уже принята." };
  if (application.assessmentInvite) return { ok: false, message: "У кандидата уже есть приглашение на ЦО. Обновите страницу." };
  if (!session || !invitesFaculty(session, application.user.faculty)) return { ok: false, message: "Выберите сбор факультета кандидата." };
  const snapshot = readPlace(session.invited);
  const place = placeOf(session);
  if (!session.invitedAt || !snapshot || placeProblem(snapshot) || placeChanged(snapshot, place)) return { ok: false, message: "Выберите опубликованный сбор с актуальными местом и временем." };
  if (!canChangeAnswer(new Date(), slotStartsAt(session))) return { ok: false, message: "До начала выбранного времени осталось меньше двух часов." };

  const sections = await applicationSections(params.seasonId, questions);
  const homeworkSections = new Set(sections.filter((section) => section.homework).map((section) => section.title));
  const saved = Object.fromEntries(application.answers.map((answer) => [answer.questionId, answer.value as AnswerValue]));
  const suggested = suggestAnswers(questions, application.user);
  const filled = Object.entries(suggested).filter(([questionId]) => !(questionId in saved));
  const homeworkAnswers: Record<string, AnswerValue> = {};
  for (const question of questions) {
    if (!homeworkSections.has(question.section) || question.type !== "URL") continue;
    const raw = saved[question.id];
    const url = typeof raw === "string" ? normalizeUrl(raw) : null;
    if (url) homeworkAnswers[question.id] = url;
  }
  const homework = homeworkText(questions, homeworkSections, homeworkAnswers);
  const homeworkPresent = Boolean(homework || application.submissions.length);
  const accepted = await db.$transaction(async (tx) => {
    // Пока идёт обычный приём, кандидат может отправлять анкету сам.
    // Не допускаем одновременного принятия организатором при открытом этапе.
    await tx.$queryRaw`SELECT id FROM stages WHERE "seasonId" = ${params.seasonId} AND kind = 'APPLICATION' FOR SHARE`;
    const stage = await tx.stage.findUnique({ where: { seasonId_kind: { seasonId: params.seasonId, kind: "APPLICATION" } }, select: { mode: true, opensAt: true, closesAt: true } });
    if (!stage || stageState(stage) !== "closed") return "stage" as const;
    const changed = await tx.application.updateMany({
      where: { id: application.id, seasonId: params.seasonId, status: "DRAFT" },
      data: { status: "SUBMITTED", submittedAt: new Date(), firstName: application.firstName ?? application.user.firstName, lastName: application.lastName ?? application.user.lastName, middleName: application.middleName ?? application.user.middleName, studentId: application.studentId ?? application.user.studentId },
    });
    if (!changed.count) return "changed" as const;
    if (filled.length) await tx.answer.createMany({ data: filled.map(([questionId, value]) => ({ applicationId: application.id, questionId, value })), skipDuplicates: true });
    if (homework && !application.submissions.length) await tx.submission.create({ data: { applicationId: application.id, stageKind: "HOMEWORK", text: homework, via: "SITE" } });
    await writeAudit({ actorId: params.actorId, action: "application.accept_by_staff", entityType: "application", entityId: application.id, meta: { name: [application.lastName ?? application.user.lastName, application.firstName ?? application.user.firstName].filter(Boolean).join(" "), homeworkPresent, sessionId: session.id, session: session.title }, ...context }, tx);
    return "accepted" as const;
  });
  if (accepted === "stage") return { ok: false, message: "Принятие организатором доступно только после закрытия приёма анкет." };
  if (accepted === "changed") return { ok: false, message: "Анкета уже принята — обновите страницу." };

  let reviewAssigned = false;
  try {
    reviewAssigned = Boolean(await assignApplication(application.id, "APPLICATION", params.actorId));
    if (homeworkPresent) await assignFollowUp(application.id, "HOMEWORK");
  } catch (error) {
    console.error("Не удалось назначить мастера принятой анкете", error);
  }

  let invited = false;
  let inviteAuditRecorded = true;
  try {
    const result = await inviteSession(params.seasonId, session.id, [application.id], application.user.faculty ?? undefined);
    invited = result.ok && result.invited === 1;
    if (invited) {
      try {
        await writeAudit({ actorId: params.actorId, action: "assessment.session.invite", entityType: "assessment_session", entityId: session.id, meta: { invited: 1, faculty: application.user.faculty, manual: true, applicationId: application.id }, ...context });
      } catch (error) {
        inviteAuditRecorded = false;
        console.error("Не удалось отдельно записать аудит приглашения на ЦО", error);
      }
    }
  } catch (error) {
    console.error("Не удалось пригласить принятую анкету на ЦО", error);
  }
  const homeworkMessage = homeworkPresent ? "Сдача ДЗ сохранена." : "Ссылка на ДЗ отсутствует — сдача ДЗ не создана.";
  const inviteMessage = invited ? "Приглашение на ЦО создано." : "Приглашение на ЦО не создано — пригласите кандидата отдельно.";
  const reviewMessage = reviewAssigned ? "" : " Мастер анкеты не назначен — распределите её вручную.";
  const auditMessage = inviteAuditRecorded ? "" : " Отдельная запись приглашения в журнале не создана; проверьте журнал.";
  return { ok: true, applicationId: application.id, homeworkPresent, invited, reviewAssigned, auditRecorded: inviteAuditRecorded, message: `Анкета принята. ${homeworkMessage} ${inviteMessage}${reviewMessage}${auditMessage}` };
}
