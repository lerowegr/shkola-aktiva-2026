import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { candidateExportFile, safeExportCell } from "./candidate-export";

beforeEach(resetDatabase);
describe("резервная выгрузка кандидатов", () => {
  it("сохраняет ответы, оценки, явку, запись и решения в открываемой книге", async () => {
    const season = await db.season.create({ data: { slug: "backup", title: "SHA", year: 2026, isCurrent: true } });
    const user = await db.user.create({ data: { telegramId: "123", phone: "+79990000000", faculty: "ФЭБ" } });
    const master = await db.user.create({ data: { firstName: "Мастер", lastName: "Отбора" } });
    const app = await db.application.create({ data: { seasonId: season.id, userId: user.id, status: "SUBMITTED", firstName: "Анна", lastName: "Иванова" } });
    const q = await db.formQuestion.create({ data: { seasonId: season.id, stageKind: "APPLICATION", section: "О себе", order: 1, type: "SHORT_TEXT", label: "Мотивация" } });
    await db.answer.create({ data: { applicationId: app.id, questionId: q.id, value: "=HYPERLINK(\"evil\")" } });
    const c = await db.criterion.create({ data: { seasonId: season.id, stageKind: "APPLICATION", order: 1, title: "Мотивация", maxScore: 5, levels: [] } });
    const review = await db.review.create({ data: { applicationId: app.id, stageKind: "APPLICATION", reviewerId: master.id, comment: "Хорошо" } });
    await db.reviewScore.create({ data: { reviewId: review.id, criterionId: c.id, score: 4, comment: "Развёрнутый ответ" } });
    const session = await db.assessmentSession.create({ data: { seasonId: season.id, title: "Резерв", startsAt: new Date("2026-10-31T15:30:00+03:00") } });
    await db.assessmentInvite.create({ data: { applicationId: app.id, sessionId: session.id, attended: true, answer: "GOING" } });
    const slot = await db.interviewSlot.create({ data: { seasonId: season.id, startsAt: new Date("2026-11-03T10:00:00+03:00"), endsAt: new Date("2026-11-03T10:45:00+03:00"), location: "Масловка", interviewers: { create: { userId: master.id } }, bookings: { create: { applicationId: app.id } } } });
    await db.stageDecision.create({ data: { applicationId: app.id, stageKind: "INTERVIEW", outcome: "PASSED" } });
    const file = await candidateExportFile(season.id);
    expect(file.candidates).toBe(1);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.bytes);
    expect(book.worksheets.map(s => s.name)).toContain("Кандидаты");
    expect(book.worksheets.map(s => s.name)).toContain("Ответы анкеты");
    expect(book.getWorksheet("Кандидаты")?.getCell("B2").value).toBe("Иванова Анна");
    expect(book.getWorksheet("Ответы анкеты")?.getCell("G2").value).toBe("'=HYPERLINK(\"evil\")");
    expect(book.getWorksheet("Оценки")?.getCell("F2").value).toBe(4);
    expect(book.getWorksheet("ЦО")?.getCell("E2").value).toBe("Да");
    expect(book.getWorksheet("Собеседования")?.getCell("E2").value).toBe(slot.location);
    expect(book.getWorksheet("Решения")?.getCell("D2").value).toBe("PASSED");
  });
  it("экранирует формулы при импорте в Google Таблицы", () => {
    expect(safeExportCell(" =1+1")).toBe("' =1+1");
    expect(safeExportCell("https://drive.google.com/folder")).toBe("https://drive.google.com/folder");
  });
});
