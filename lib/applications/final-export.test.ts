import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { finalDecisionExportFile } from "./final-export";

beforeEach(resetDatabase);

describe("выгрузка итоговых списков", () => {
  it("разносит принятых и резерв по двум листам, не включает отказ и отмечает черновики", async () => {
    const season = await db.season.create({ data: { slug: "final-export", title: "ША", year: 2026, isCurrent: true } });
    const master = await db.user.create({ data: { firstName: "Мастер" } });
    const criterion = await db.criterion.create({ data: { seasonId: season.id, stageKind: "APPLICATION", order: 1, title: "Анкета", maxScore: 5, levels: [] } });
    async function add(name: string, outcome: "PASSED" | "RESERVE" | "REJECTED") {
      const user = await db.user.create({ data: { faculty: "ЮФ", course: "2", phone: "+79990000000", telegramUsername: "bot_maria", email: `${name}@example.test` } });
      const application = await db.application.create({ data: { seasonId: season.id, userId: user.id, status: "SUBMITTED", firstName: name, lastName: "Иванова" } });
      await db.stageDecision.create({ data: { applicationId: application.id, stageKind: "INTERVIEW", outcome } });
      return application;
    }
    const accepted = await add("Анна", "PASSED");
    const reserve = await add("Мария", "RESERVE");
    await add("Ольга", "REJECTED");
    const review = await db.review.create({ data: { applicationId: accepted.id, stageKind: "APPLICATION", reviewerId: master.id } });
    await db.reviewScore.create({ data: { reviewId: review.id, criterionId: criterion.id, score: 4 } });
    await db.finalDecisionComment.create({ data: { applicationId: reserve.id, authorId: master.id, body: "=HYPERLINK(\"bad\")" } });
    async function question(order: number, label: string, format?: "GROUP" | "VK" | "TELEGRAM" | "PHONE", section = "Контактная информация") {
      return db.formQuestion.create({ data: { seasonId: season.id, stageKind: "APPLICATION", section, order, type: "SHORT_TEXT", label, format } });
    }
    const fields = await Promise.all([
      question(1, "Номер учебной группы", "GROUP"),
      question(2, "Размер футболки"),
      question(3, "Ссылка на ВК", "VK"),
      question(4, "Ник в ТГ", "TELEGRAM"),
      question(5, "Номер телефона", "PHONE"),
      question(6, "Ссылка на папку с выполненными заданиями", undefined, "Домашнее задание"),
      question(7, "Что тебе даст ША?", undefined, "О тебе"),
    ]);
    await db.answer.createMany({ data: [
      { applicationId: reserve.id, questionId: fields[0]!.id, value: "Ю26-3В" },
      { applicationId: reserve.id, questionId: fields[1]!.id, value: "M" },
      { applicationId: reserve.id, questionId: fields[2]!.id, value: "https://vk.ru/maria_26" },
      { applicationId: reserve.id, questionId: fields[3]!.id, value: "@maria_26" },
      { applicationId: reserve.id, questionId: fields[4]!.id, value: "+7 (999) 111-22-33" },
      { applicationId: reserve.id, questionId: fields[5]!.id, value: "https://drive.google.com/drive/folders/abc" },
      { applicationId: reserve.id, questionId: fields[6]!.id, value: "Новые навыки" },
    ] });

    const file = await finalDecisionExportFile(season.id);
    expect(file).toMatchObject({ passed: 1, reserve: 1 });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.bytes);
    expect(book.worksheets.slice(0, 2).map((sheet) => sheet.name)).toEqual(["Берём", "Резерв"]);
    expect(book.getWorksheet("Берём")?.rowCount).toBe(2);
    expect(book.getWorksheet("Резерв")?.rowCount).toBe(2);
    expect(book.getWorksheet("Берём")?.getCell("B2").value).toBe("Иванова Анна");
    expect(book.getWorksheet("Берём")?.getCell("M2").value).toBe(4);
    expect(book.getWorksheet("Берём")?.getCell("W2").value).toBe("Черновик");
    expect(book.getWorksheet("Резерв")?.getCell("B2").value).toBe("Иванова Мария");
    expect(book.getWorksheet("Резерв")?.getCell("E2").value).toBe("Ю26-3В");
    expect(book.getWorksheet("Резерв")?.getCell("F2").value).toBe("M");
    expect(book.getWorksheet("Резерв")?.getCell("G2").value).toBe("'+7 (999) 111-22-33");
    expect(book.getWorksheet("Резерв")?.getCell("H2").value).toBe("https://vk.ru/maria_26");
    expect(book.getWorksheet("Резерв")?.getCell("I2").value).toBe("https://t.me/maria_26");
    expect(book.getWorksheet("Резерв")?.getCell("U2").value).toBe("https://drive.google.com/drive/folders/abc");
    expect(book.getWorksheet("Резерв")?.getCell("V2").value).toBe("'=HYPERLINK(\"bad\")");
    expect(book.getWorksheet("Кандидаты")?.rowCount).toBe(3);
    expect(book.getWorksheet("Ответы анкеты")?.rowCount).toBe(8);
    expect(book.getWorksheet("Комментарии итогов")?.getCell("D2").value).toBe("'=HYPERLINK(\"bad\")");
  });
});
