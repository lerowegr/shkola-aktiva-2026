/**
 * Наклейки для перебивки главной: объекты, маскоты и логотип с белой
 * обводкой по контуру, как вырезанный стикер. Обводка запекается в картинку
 * — CSS-фильтры на анимируемых элементах тормозят на телефонах.
 *
 * У большинства картинок объектов белый фон: его убираем заливкой от краёв
 * (только то, что связано с рамкой, — блики внутри стекла остаются).
 *
 * Запуск: npx tsx scripts/make-stickers.ts → public/brand/stickers/*.webp.
 * Повторять, только если поменялись исходные картинки.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const BRAND = path.resolve("public/brand");
const OUT = path.join(BRAND, "stickers");

const SOURCES: { name: string; file: string; size: number }[] = [
  { name: "logo", file: "logo-sticker.webp", size: 800 },
  { name: "logo-short", file: "logo-sticker-short.webp", size: 320 },
  { name: "asterisk", file: "objects/asterisk-glass.webp", size: 360 },
  { name: "star", file: "objects/star-glass.webp", size: 360 },
  { name: "heart", file: "objects/heart-glass.webp", size: 360 },
  { name: "smile", file: "objects/smile-glass.webp", size: 360 },
  { name: "flame", file: "objects/flame-glass.webp", size: 360 },
  { name: "cursor", file: "objects/cursor-glass.webp", size: 320 },
  { name: "mascot-yellow", file: "mascots/yellow-b.webp", size: 320 },
  { name: "mascot-blue", file: "mascots/blue-a.webp", size: 320 },
];

/** Почти белый пиксель фона: светлый и без заметного цвета. */
function whitish(data: Buffer, at: number): boolean {
  const r = data[at]!;
  const g = data[at + 1]!;
  const b = data[at + 2]!;
  return Math.min(r, g, b) > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 20;
}

/** Убирает белый фон, связанный с краями картинки (заливка от рамки). */
function clearBackground(data: Buffer, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index]) return;
    seen[index] = 1;
    const at = index * 4;
    if (data[at + 3]! < 16 || whitish(data, at)) queue.push(index);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (queue.length) {
    const index = queue.pop()!;
    data[index * 4 + 3] = 0;
    const x = index % width;
    const y = (index - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

async function makeSticker(source: (typeof SOURCES)[number]) {
  const resized = await sharp(path.join(BRAND, source.file))
    .ensureAlpha()
    .resize(source.size, source.size, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const data = resized.data;
  clearBackground(data, width, height);

  // Обводка: размытая и обрезанная по порогу маска — ровный белый контур.
  const border = Math.round(Math.max(width, height) * 0.035);
  const pad = border + 2;
  const full = { width: width + pad * 2, height: height + pad * 2 };
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3]!;
  const blurred = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#000000" })
    .blur(border * 0.55)
    // После extend sharp отдаёт три канала — берём один, иначе шаг не тот.
    .extractChannel(0)
    .raw()
    .toBuffer();
  const outline = Buffer.alloc(full.width * full.height * 4);
  for (let i = 0; i < full.width * full.height; i++) {
    outline.set([255, 255, 255, Math.max(0, Math.min(255, (blurred[i]! - 6) * 8))], i * 4);
  }

  const original = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  await sharp(outline, { raw: { ...full, channels: 4 } })
    .composite([{ input: original, left: pad, top: pad }])
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(path.join(OUT, `${source.name}.webp`));
  return `${source.name}: ${full.width}×${full.height}`;
}

await mkdir(OUT, { recursive: true });
for (const source of SOURCES) console.log(await makeSticker(source));
