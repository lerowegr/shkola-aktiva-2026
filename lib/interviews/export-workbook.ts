import ExcelJS from "exceljs";
import type { InterviewExportDay } from "./export";

export function createInterviewWorkbook(days: InterviewExportDay[]) {
  const book = new ExcelJS.Workbook();
  book.creator = "Школа Актива";
  for (const day of days.length ? days : [{ date: "", name: "Нет слотов", times: [], masters: [], cells: new Map<string, string>() }]) {
    const sheet = book.addWorksheet(day.name, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    sheet.addRow(["Мастер отбора / время", ...day.times]);
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242424" } }; cell.alignment = { vertical: "middle", wrapText: true }; });
    sheet.getColumn(1).width = 29;
    for (let i = 0; i < day.times.length; i++) sheet.getColumn(i + 2).width = 42;
    for (const [index, master] of day.masters.entries()) {
      const row = sheet.addRow([master, ...day.times.map(time => day.cells.get(`${master}\0${time}`) ?? "")]);
      row.height = Math.max(46, ...day.times.map(time => Math.min(110, 15 * (day.cells.get(`${master}\0${time}`)?.split("\n").length ?? 1))));
      row.eachCell({ includeEmpty: true }, (cell, col) => { cell.alignment = { vertical: "top", wrapText: true }; if (col === 1) cell.font = { bold: true }; if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F7FA" } }; });
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, day.masters.length + 1), column: Math.max(1, day.times.length + 1) } };
  }
  return book;
}
