import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { deleteImageFiles, IMAGE_ERRORS, imageFile, MAX_IMAGE_BYTES, processImage, siteImagesDir } from "./images";

beforeAll(async () => {
  process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "sha-images-"));
});

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 28, g: 99, b: 255 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "секрет" } })
    .toBuffer();

describe("обработка фото", () => {
  it("большое фото: мастер до 2400 и три варианта webp, без метаданных", async () => {
    const result = await processImage(await photo(3000, 2000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.width, result.height]).toEqual([2400, 1600]);

    for (const width of [480, 960, 1600] as const) {
      const meta = await sharp(imageFile(result.storageKey, width)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(width);
      expect(meta.exif).toBeUndefined();
    }
  });

  it("маленькое фото не растягивается", async () => {
    const result = await processImage(await photo(300, 200));
    if (!result.ok) throw new Error(result.message);
    expect((await sharp(imageFile(result.storageKey, 1600)).metadata()).width).toBe(300);
  });

  it("не фото, HEIC и слишком большой файл — понятный отказ", async () => {
    expect(await processImage(Buffer.from("просто текст, а не картинка"))).toEqual({ ok: false, message: IMAGE_ERRORS.notImage });

    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64)]);
    expect(await processImage(heic)).toEqual({ ok: false, message: IMAGE_ERRORS.heic });

    expect(await processImage(Buffer.alloc(MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, message: IMAGE_ERRORS.tooBig });
  });

  it("удаление убирает все варианты", async () => {
    const result = await processImage(await photo(800, 600));
    if (!result.ok) throw new Error(result.message);
    await deleteImageFiles(result.storageKey);
    const left = (await readdir(siteImagesDir())).filter((name) => name.startsWith(result.storageKey));
    expect(left).toEqual([]);
  });
});
