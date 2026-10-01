import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { DEFAULT_CONTENT, hasContent, mergeContent, siteContentSchema } from "./content";
import { loadSiteContent, saveSiteContent } from "./store";

describe("тексты сайта: схема", () => {
  it("отрезает лишние поля и обрезает пробелы", () => {
    const parsed = siteContentSchema.parse({
      ...DEFAULT_CONTENT,
      hero: { tagline: "  Привет  ", lie: "лишнее" },
    });
    expect(parsed.hero).toEqual({ tagline: "Привет" });
  });

  it("ограничивает длину и число пунктов — с понятной ошибкой", () => {
    const long = siteContentSchema.safeParse({ ...DEFAULT_CONTENT, hero: { tagline: "а".repeat(161) } });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toBe("Слишком длинно: до 160 знаков.");

    const many = siteContentSchema.safeParse({
      ...DEFAULT_CONTENT,
      about: { ...DEFAULT_CONTENT.about, points: ["1", "2", "3", "4", "5"] },
    });
    expect(many.error?.issues[0]?.message).toBe("Не больше 4 пунктов.");
  });

  it("ссылки только https, почта — похожая на почту", () => {
    const bad = siteContentSchema.safeParse({
      ...DEFAULT_CONTENT,
      contacts: { telegram: "javascript:alert(1)", vk: "", email: "не почта" },
    });
    expect(bad.error?.issues.map((issue) => issue.message)).toEqual([
      "Ссылка должна начинаться с https://",
      "Почта указана неверно.",
    ]);
  });
});

describe("тексты сайта: сборка", () => {
  it("недостающее и сломанное — из значений по умолчанию, по разделам", () => {
    const merged = mergeContent({
      hero: { tagline: "Своё" },
      faq: { title: 1 }, // сломан — берётся по умолчанию
    });
    expect(merged.hero.tagline).toBe("Своё");
    expect(merged.faq).toEqual(DEFAULT_CONTENT.faq);
    expect(merged.selection).toEqual(DEFAULT_CONTENT.selection);
    expect(mergeContent(null)).toEqual(DEFAULT_CONTENT);
  });

  it("пустые разделы не показываются", () => {
    expect(hasContent(DEFAULT_CONTENT, "program")).toBe(false);
    expect(hasContent(DEFAULT_CONTENT, "venue")).toBe(false);
    expect(hasContent(DEFAULT_CONTENT, "faq")).toBe(true);
    expect(hasContent({ ...DEFAULT_CONTENT, venue: { ...DEFAULT_CONTENT.venue, dates: "июль" } }, "venue")).toBe(true);
  });
});

describe("тексты сайта: хранение", () => {
  let seasonId: string;
  beforeEach(async () => {
    await resetDatabase();
    seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  });

  it("без записи в базе — значения по умолчанию", async () => {
    expect(await loadSiteContent(seasonId)).toEqual(DEFAULT_CONTENT);
  });

  it("сохраняет и называет только изменённые разделы", async () => {
    const user = await db.user.create({ data: {} });
    const next = { ...DEFAULT_CONTENT, venue: { ...DEFAULT_CONTENT.venue, dates: "июль" } };

    expect(await saveSiteContent(seasonId, next, user.id)).toEqual({ changed: ["venue"] });
    expect((await loadSiteContent(seasonId)).venue.dates).toBe("июль");
    expect(await saveSiteContent(seasonId, next, user.id)).toEqual({ changed: [] });
  });
});
