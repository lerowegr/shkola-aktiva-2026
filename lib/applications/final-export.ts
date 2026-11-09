import ExcelJS from "exceljs";

import { db } from "~~/lib/db";
import { candidateExportFile, safeExportCell } from "~~/lib/interviews/candidate-export";
import { botWhen } from "~~/lib/interviews/bot-rules";

import { rankFinal, type FinalPart, type RankRow } from "./decisions";

const HEADINGS = [
  "№", "ФИО", "Факультет", "Курс", "Учебная группа", "Размер футболки",
  "Номер телефона", "Страница ВК", "Страница Telegram", "Telegram в боте",
  "Почта", "Студенческий билет", "Анкета", "ДЗ", "ЦО", "Собеседование",
  "Итоговый балл", "Явка на ЦО", "Дата собеседования", "Корпус собеседования",
  "Ссылка на ДЗ", "Последний комментарий", "Статус итога", "ID анкеты",
];
const WIDTHS = [7, 38, 18, 12, 22, 18, 23, 35, 35, 25, 30, 20, 12, 12, 12, 18, 17, 16, 24, 25, 44, 50, 18, 28];

function answerText(input: unknown): string {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) return input.map(answerText).join(", ");
  return input == null ? "" : JSON.stringify(input);
}

function telegramPage(raw: string): string {
  if (!raw) return "";
  const name = raw.replace(/^https?:\/\/(?:t\.me|telegram\.me)\//i, "").replace(/^@/, "").split(/[/?#]/)[0] ?? "";
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) ? `https://t.me/${name}` : raw;
}

function stageScore(row: RankRow, stage: FinalPart): number | string {
  return row.parts?.find((part) => part.stage === stage)?.average ?? "";
}

/** Рабочий файл организаторов: два списка по текущим итоговым решениям, включая черновики. */
export async function finalDecisionExportFile(seasonId: string) {
  const rows = (await rankFinal(seasonId)).filter((row) => row.decision === "PASSED" || row.decision === "RESERVE");
  const ids = rows.map((row) => row.id);
  const [questions, applications] = await Promise.all([
    db.formQuestion.findMany({
      where: { seasonId, stageKind: "APPLICATION" },
      orderBy: { order: "asc" },
      select: { id: true, label: true, section: true, format: true },
    }),
    db.application.findMany({
      where: { seasonId, id: { in: ids } },
      select: {
        id: true, studentId: true,
        user: { select: { course: true, phone: true, email: true, studentId: true } },
        answers: { select: { questionId: true, value: true } },
        bookings: { where: { cancelledAt: null }, take: 1, select: { slot: { select: { startsAt: true, location: true } } } },
      },
    }),
  ]);
  const detailsById = new Map(applications.map((app) => [app.id, app]));
  const field = {
    group: questions.find((q) => q.format === "GROUP" || /номер учебной группы/i.test(q.label))?.id,
    shirt: questions.find((q) => /размер.*футбол/i.test(q.label))?.id,
    phone: questions.find((q) => q.format === "PHONE")?.id,
    vk: questions.find((q) => q.format === "VK")?.id,
    telegram: questions.find((q) => q.format === "TELEGRAM")?.id,
    homework: questions.find((q) => /домашн/i.test(q.section) && /ссылка|папк/i.test(q.label))?.id,
  };

  const book = new ExcelJS.Workbook();
  book.creator = "Школа Актива";
  for (const [outcome, title] of [["PASSED", "Берём"], ["RESERVE", "Резерв"]] as const) {
    const sheet = book.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
    sheet.addRow(HEADINGS);
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242424" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    const selected = rows.filter((row) => row.decision === outcome);
    selected.forEach((row, index) => {
      const app = detailsById.get(row.id);
      const answers = new Map(app?.answers.map((answer) => [answer.questionId, answerText(answer.value)]) ?? []);
      const answer = (questionId?: string) => questionId ? answers.get(questionId) ?? "" : "";
      const telegram = answer(field.telegram) || (row.telegramUsername ? `@${row.telegramUsername}` : "");
      const values = [
        index + 1, row.name, row.faculty, app?.user.course, answer(field.group), answer(field.shirt),
        answer(field.phone) || app?.user.phone, answer(field.vk), telegramPage(telegram),
        row.telegramUsername ? `@${row.telegramUsername}` : "", app?.user.email,
        app?.studentId ?? app?.user.studentId,
        stageScore(row, "APPLICATION"), stageScore(row, "HOMEWORK"),
        stageScore(row, "ASSESSMENT"), stageScore(row, "INTERVIEW"),
        row.average ?? "", row.assessmentPassed ? "Да" : "Нет",
        app?.bookings[0]?.slot.startsAt ? botWhen(app.bookings[0].slot.startsAt) : "",
        app?.bookings[0]?.slot.location, answer(field.homework), row.latestComment,
        row.published ? "Опубликовано" : "Черновик", row.id,
      ];
      const added = sheet.addRow(values.map(safeExportCell));
      added.alignment = { vertical: "top", wrapText: true };
      if (index % 2 === 1) added.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F7FA" } }; });
    });
    HEADINGS.forEach((_, index) => { sheet.getColumn(index + 1).width = WIDTHS[index]!; });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, selected.length + 1), column: HEADINGS.length } };
  }
  // Подробные листы связаны с двумя списками по ID анкеты и содержат только
  // людей из этих списков: ответы анкеты, ДЗ, оценки и комментарии всех этапов.
  const detailFile = await candidateExportFile(seasonId, { applicationIds: ids, workbook: book });
  return {
    bytes: detailFile.bytes,
    passed: rows.filter((row) => row.decision === "PASSED").length,
    reserve: rows.filter((row) => row.decision === "RESERVE").length,
  };
}
