import ExcelJS from "exceljs";

import { db } from "~~/lib/db";
import { safeExportCell } from "~~/lib/interviews/candidate-export";

import { rankFinal, type FinalPart, type RankRow } from "./decisions";

const HEADINGS = [
  "№", "ФИО", "Факультет", "Курс", "Telegram", "Телефон",
  "Анкета", "ДЗ", "ЦО", "Собеседование", "Итоговый балл",
  "Последний комментарий", "Статус итога", "ID анкеты",
];

function stageScore(row: RankRow, stage: FinalPart): number | string {
  return row.parts?.find((part) => part.stage === stage)?.average ?? "";
}

/** Рабочий файл организаторов: два списка по текущим итоговым решениям, включая черновики. */
export async function finalDecisionExportFile(seasonId: string) {
  const rows = (await rankFinal(seasonId)).filter((row) => row.decision === "PASSED" || row.decision === "RESERVE");
  const applications = await db.application.findMany({
    where: { seasonId, id: { in: rows.map((row) => row.id) } },
    select: { id: true, user: { select: { course: true, phone: true } } },
  });
  const contacts = new Map(applications.map((app) => [app.id, app.user]));

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
      const contact = contacts.get(row.id);
      const values = [
        index + 1, row.name, row.faculty, contact?.course,
        row.telegramUsername ? `@${row.telegramUsername}` : "", contact?.phone,
        stageScore(row, "APPLICATION"), stageScore(row, "HOMEWORK"),
        stageScore(row, "ASSESSMENT"), stageScore(row, "INTERVIEW"),
        row.average ?? "", row.latestComment, row.published ? "Опубликовано" : "Черновик", row.id,
      ];
      const added = sheet.addRow(values.map(safeExportCell));
      added.alignment = { vertical: "top", wrapText: true };
      if (index % 2 === 1) added.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F7FA" } }; });
    });
    HEADINGS.forEach((_, index) => { sheet.getColumn(index + 1).width = [7, 38, 19, 10, 25, 22, 12, 12, 12, 18, 17, 50, 18, 28][index]!; });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, selected.length + 1), column: HEADINGS.length } };
  }
  return {
    bytes: Buffer.from(await book.xlsx.writeBuffer()),
    passed: rows.filter((row) => row.decision === "PASSED").length,
    reserve: rows.filter((row) => row.decision === "RESERVE").length,
  };
}
