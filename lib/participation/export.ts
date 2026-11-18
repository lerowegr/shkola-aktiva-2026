import { db } from "~~/lib/db";
import { rankFinal, FINAL_PARTS } from "~~/lib/applications/decisions";
import type { Prisma } from "~~/lib/generated/prisma/client";
import { csvCell } from "~~/lib/games/sha-test";
import { botWhen } from "~~/lib/interviews/bot-rules";

import { QUESTIONS } from "./form";

const stageLabels = ["Анкета", "ДЗ", "ЦО", "Собеседование"];
const selections = {
  completed: {
    assessmentInvite: { is: { attended: true } },
    OR: [
      { reviews: { some: { stageKind: "INTERVIEW", scores: { some: {} } } } },
      { interviewNotes: { some: { note: { not: "" } } } },
    ],
  },
  participation: { participation: { isNot: null } },
} satisfies Record<string, Prisma.ApplicationWhereInput>;

export const participationAnswerKeys = Object.keys(QUESTIONS).filter((key) => key !== "scan") as Exclude<keyof typeof QUESTIONS, "scan">[];

function csvValue(value: unknown): string | number {
  if (value == null) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "string") {
    // Защищаем также значения с пробелами перед формулой.
    return /^\s*[=+@-]/.test(value) ? `'${value}` : value;
  }
  if (Array.isArray(value)) return value.map(csvValue).join(", ");
  return JSON.stringify(value);
}

export async function selectionCsv(seasonId: string, kind: keyof typeof selections) {
  const [ranking, questions, apps] = await Promise.all([
    rankFinal(seasonId),
    db.formQuestion.findMany({
      where: { seasonId, stageKind: "APPLICATION" }, orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, section: true, label: true },
    }),
    db.application.findMany({
      where: { seasonId, status: "SUBMITTED", ...selections[kind] },
      select: {
        id: true, studentId: true, submittedAt: true,
        user: { select: { faculty: true, course: true, phone: true, email: true, telegramUsername: true, studentId: true } },
        answers: { select: { questionId: true, value: true } },
        submissions: {
          where: { stageKind: "HOMEWORK", replacedAt: null }, orderBy: { submittedAt: "asc" },
          select: { text: true, upload: { select: { filename: true } } },
        },
        participation: kind === "participation" && { select: { submittedAt: true, invitedAt: true, attending: true, answers: true, scanMime: true } },
      },
    }),
  ]);
  const appById = new Map(apps.map((app) => [app.id, app]));
  const includeParticipation = kind === "participation";
  const rows: unknown[][] = [[
    "ID анкеты", "ФИО", "Факультет", "Курс", "Телефон в профиле", "Почта", "Telegram в боте", "Студенческий билет", "Анкета отправлена",
    ...stageLabels.flatMap((label) => [`${label} — балл`, `${label} — максимум`]), "Итоговый балл", "Итоговое решение", "Явка на ЦО",
    ...questions.map(({ section, label }) => `${section} — ${label}`), "Домашнее задание",
    ...(includeParticipation ? [
      "Анкета участника — статус", "Приглашение отправлено", "Анкета участника отправлена",
      ...participationAnswerKeys.map((key) => `Анкета участника — ${participationColumn[key]}`), "Скан заявления получен",
    ] : []),
  ]];

  for (const row of ranking) {
    const app = appById.get(row.id);
    if (!app) continue;
    const answers = new Map(app.answers.map((entry) => [entry.questionId, entry.value]));
    const signUp = app.participation;
    const signUpAnswers = signUp?.answers as Record<string, unknown> | null;
    const decision = { PASSED: "Берём", RESERVE: "Резерв", REJECTED: "Не берём" };
    rows.push([
      row.id, row.name, app.user.faculty, app.user.course, app.user.phone, app.user.email,
      app.user.telegramUsername && `https://t.me/${app.user.telegramUsername}`,
      app.studentId || app.user.studentId, app.submittedAt && botWhen(app.submittedAt),
      ...FINAL_PARTS.flatMap((stage) => {
        const part = row.parts?.find((item) => item.stage === stage);
        return [part?.average, part?.max];
      }),
      row.average, row.decision && decision[row.decision], row.assessmentPassed,
      ...questions.map(({ id }) => answers.get(id)),
      app.submissions.map((entry) => [entry.text, entry.upload?.filename].filter(Boolean).join(" — ")).join("\n"),
      ...(includeParticipation ? [
        !signUp?.submittedAt ? "Ожидает ответа" : signUp.attending ? "Участие подтверждено" : "Не сможет приехать",
        signUp?.invitedAt && botWhen(signUp.invitedAt), signUp?.submittedAt && botWhen(signUp.submittedAt),
        ...participationAnswerKeys.map((key) => signUpAnswers?.[key]),
        signUp?.scanMime != null,
      ] : []),
    ]);
  }

  return { count: rows.length - 1, text: `\uFEFF${rows.map((row) => row.map((value) => csvCell(csvValue(value))).join(";")).join("\r\n")}\r\n` };
}

const participationColumn: Record<(typeof participationAnswerKeys)[number], string> = {
  consent: "Согласие на обработку данных",
  attending: "Будет все три дня",
  passportName: "ФИО по паспорту",
  passportNumber: "Серия и номер паспорта",
  passportDate: "Дата выдачи паспорта",
  passportIssuer: "Кем выдан паспорт",
  citizenship: "Гражданство",
  studentId: "Номер студенческого билета",
  diet: "Особенности питания",
  conditions: "Хронические заболевания",
  medication: "Лекарства",
  healthNotes: "Дополнительно о здоровье",
  minor: "Несовершеннолетний",
};
