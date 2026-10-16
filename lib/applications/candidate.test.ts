import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { applicationSections, draftFor } from "./candidate";

describe("черновик анкеты", () => {
  let seasonId: string;

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  });

  it("десять первых автосохранений разом — один черновик, ни одно не падает", async () => {
    const user = await db.user.create({ data: { firstName: "Аня" } });
    const drafts = await Promise.all(Array.from({ length: 10 }, () => draftFor(user.id, seasonId)));
    expect(new Set(drafts.map((draft) => draft.id)).size).toBe(1);
    expect(await db.application.count()).toBe(1);
  });
});

describe("разделы-шаги", () => {
  it("в порядке разделов, без пустых, раздел без строки в таблице — в конце", async () => {
    await resetDatabase();
    const seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
    await db.formSection.createMany({
      data: [
        { seasonId, stageKind: "APPLICATION", order: 2, title: "Опыт", description: "Расскажи" },
        { seasonId, stageKind: "APPLICATION", order: 1, title: "Контакты" },
        { seasonId, stageKind: "APPLICATION", order: 3, title: "Пустой" },
      ],
    });
    const sections = await applicationSections(seasonId, [{ section: "Опыт" }, { section: "Контакты" }, { section: "Старый" }]);
    expect(sections).toEqual([
      { title: "Контакты", description: null, homework: false },
      { title: "Опыт", description: "Расскажи", homework: false },
      { title: "Старый", description: null, homework: false },
    ]);
  });
});
