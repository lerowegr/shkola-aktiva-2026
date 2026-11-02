import { describe, expect, it } from "vitest";
import { buildInterviewExport } from "./export";
import { createInterviewWorkbook } from "./export-workbook";
import ExcelJS from "exceljs";

describe("выгрузка собеседований", () => {
  it("раскладывает московские дни по листам, время по столбцам и мастеров по строкам", () => {
    const at = (day: number, hour: number, minute: number) => new Date(`2026-11-0${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`);
    const days = buildInterviewExport([
      { startsAt: at(3, 9, 20), endsAt: at(3, 10, 5), master: "Ярцев Егор", candidate: "Петров Пётр", location: "Eat Market", room: "12" },
      { startsAt: at(2, 8, 30), endsAt: at(2, 9, 15), master: "Иванова Инна", candidate: "Сидорова Анна", location: "Масловка", room: null },
      { startsAt: at(2, 9, 20), endsAt: at(2, 10, 5), master: "Иванова Инна", candidate: null, location: "Масловка", room: null },
    ]);
    expect(days.map(day => day.name)).toEqual(["пн 02.11", "вт 03.11"]);
    expect(days[0]?.times).toEqual(["08:30–09:15", "09:20–10:05"]);
    expect(days[0]?.masters).toEqual(["Иванова Инна"]);
    expect(days[0]?.cells.get("Иванова Инна\0" + "08:30–09:15")).toBe("Сидорова Анна\nМасловка");
    expect(days[0]?.cells.get("Иванова Инна\0" + "09:20–10:05")).toBe("Свободно\nМасловка");
    expect(days[1]?.cells.get("Ярцев Егор\0" + "09:20–10:05")).toBe("Петров Пётр\nEat Market · 12");
  });
  it("создаёт открываемый Excel с ФИО и адресом в нужной ячейке", async () => {
    const days = buildInterviewExport([{ startsAt: new Date("2026-11-02T08:30:00+03:00"), endsAt: new Date("2026-11-02T09:15:00+03:00"), master: "Ярцев Егор", candidate: "Петров Пётр", location: "Eat Market, Ленинградский проспект, 70", room: null }]);
    const bytes = await createInterviewWorkbook(days).xlsx.writeBuffer();
    const opened = new ExcelJS.Workbook();
    await opened.xlsx.load(bytes);
    expect(opened.worksheets.map(sheet => sheet.name)).toEqual(["пн 02.11"]);
    expect(opened.worksheets[0]?.getCell("A2").value).toBe("Ярцев Егор");
    expect(opened.worksheets[0]?.getCell("B1").value).toBe("08:30–09:15");
    expect(opened.worksheets[0]?.getCell("B2").value).toBe("Петров Пётр\nEat Market, Ленинградский проспект, 70");
  });
});
