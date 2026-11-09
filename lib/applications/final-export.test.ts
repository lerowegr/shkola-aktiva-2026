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
      const user = await db.user.create({ data: { faculty: "ЮФ", course: "2", phone: "+79990000000" } });
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

    const file = await finalDecisionExportFile(season.id);
    expect(file).toMatchObject({ passed: 1, reserve: 1 });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.bytes);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Берём", "Резерв"]);
    expect(book.getWorksheet("Берём")?.rowCount).toBe(2);
    expect(book.getWorksheet("Резерв")?.rowCount).toBe(2);
    expect(book.getWorksheet("Берём")?.getCell("B2").value).toBe("Иванова Анна");
    expect(book.getWorksheet("Берём")?.getCell("G2").value).toBe(4);
    expect(book.getWorksheet("Берём")?.getCell("M2").value).toBe("Черновик");
    expect(book.getWorksheet("Резерв")?.getCell("B2").value).toBe("Иванова Мария");
    expect(book.getWorksheet("Резерв")?.getCell("L2").value).toBe("'=HYPERLINK(\"bad\")");
  });
});
