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

  it("люди и фото: пределы и обязательное имя", () => {
    const photo = { id: "cabcdefghijklmnopqrstuvw", alt: "" };
    const person = { name: "Аня", role: "Медиа", photos: [photo] };
    expect(siteContentSchema.safeParse({ ...DEFAULT_CONTENT, people: { title: "", items: [person] } }).success).toBe(true);

    const nameless = siteContentSchema.safeParse({ ...DEFAULT_CONTENT, people: { title: "", items: [{ ...person, name: " " }] } });
    expect(nameless.error?.issues[0]?.message).toBe("Укажите имя.");

    const nine = siteContentSchema.safeParse({
      ...DEFAULT_CONTENT,
      people: { title: "", items: [{ ...person, photos: Array(9).fill(photo) }] },
    });
    expect(nine.error?.issues[0]?.message).toBe("Не больше 8 пунктов.");

    const longAlt = siteContentSchema.safeParse({
      ...DEFAULT_CONTENT,
      venue: { ...DEFAULT_CONTENT.venue, photos: [{ ...photo, alt: "а".repeat(161) }] },
    });
    expect(longAlt.error?.issues[0]?.message).toBe("Слишком длинно: до 160 знаков.");
  });

  it("история — до 40 событий, у события может быть фото; старый раздел ролей отбрасывается", () => {
    const event = { year: "2025", title: "", text: "", photo: null };
    expect(
      siteContentSchema.safeParse({ ...DEFAULT_CONTENT, history: { title: "", items: Array(40).fill(event) } }).success,
    ).toBe(true);
    expect(
      siteContentSchema.safeParse({ ...DEFAULT_CONTENT, history: { title: "", items: Array(41).fill(event) } }).success,
    ).toBe(false);

    const merged = mergeContent({ roles: { title: "Роли", items: [{ title: "Медиа", text: "" }] } });
    expect("roles" in merged).toBe(false);
    expect(merged.people).toEqual(DEFAULT_CONTENT.people);
  });

  it("пустые разделы не показываются", () => {
    expect(hasContent(DEFAULT_CONTENT, "program")).toBe(false);
    expect(hasContent(DEFAULT_CONTENT, "venue")).toBe(false);
    expect(hasContent(DEFAULT_CONTENT, "faq")).toBe(true);
    expect(hasContent({ ...DEFAULT_CONTENT, venue: { ...DEFAULT_CONTENT.venue, dates: "июль" } }, "venue")).toBe(true);
    expect(
      hasContent({ ...DEFAULT_CONTENT, venue: { ...DEFAULT_CONTENT.venue, photos: [{ id: "cabcdefghijklmnopqrstuvw", alt: "" }] } }, "venue"),
    ).toBe(true);
    expect(hasContent(DEFAULT_CONTENT, "people")).toBe(false);
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

    expect(await saveSiteContent(seasonId, next, user.id)).toEqual({ ok: true, changed: ["venue"], removedImages: 0 });
    expect((await loadSiteContent(seasonId)).venue.dates).toBe("июль");
    expect(await saveSiteContent(seasonId, next, user.id)).toEqual({ ok: true, changed: [], removedImages: 0 });
  });

  const image = (createdAt: Date) =>
    db.siteImage.create({
      data: { seasonId, storageKey: Math.random().toString(16).slice(2), width: 10, height: 10, bytes: 1, createdAt },
    });

  it("ссылка на несуществующее фото — отказ, тексты не меняются", async () => {
    const user = await db.user.create({ data: {} });
    const next = {
      ...DEFAULT_CONTENT,
      venue: { ...DEFAULT_CONTENT.venue, photos: [{ id: "cabcdefghijklmnopqrstuvw", alt: "" }] },
    };
    expect(await saveSiteContent(seasonId, next, user.id)).toEqual({
      ok: false,
      message: "Фото не найдено — загрузите его заново.",
    });
    expect(await loadSiteContent(seasonId)).toEqual(DEFAULT_CONTENT);
  });

  it("уборка: фото без ссылок старше часа удаляются, свежие и используемые остаются", async () => {
    const user = await db.user.create({ data: {} });
    const now = new Date("2026-10-02T12:00:00Z");
    const used = await image(new Date("2026-10-01T12:00:00Z"));
    const old = await image(new Date("2026-10-01T12:00:00Z"));
    const fresh = await image(new Date("2026-10-02T11:30:00Z"));

    const next = { ...DEFAULT_CONTENT, venue: { ...DEFAULT_CONTENT.venue, photos: [{ id: used.id, alt: "Корпус" }] } };
    expect(await saveSiteContent(seasonId, next, user.id, now)).toEqual({ ok: true, changed: ["venue"], removedImages: 1 });

    const left = (await db.siteImage.findMany({ select: { id: true } })).map((row) => row.id).sort();
    expect(left).toEqual([used.id, fresh.id].sort());
    expect(left).not.toContain(old.id);
  });
});
