/**
 * Перебивка «стикер-бомбинг»: наклейки (стеклянные объекты, маскоты,
 * короткий логотип) по одной шлёпаются на страницу, последним сверху ложится
 * большой логотип. Картинки с вырезной белой обводкой —
 * public/brand/stickers, их готовит scripts/make-stickers.ts.
 *
 * Раскладка — в процентах коллажа: на телефоне он квадратный, на широком
 * экране 16:10. `x`, `y` — центр наклейки, `w` — ширина, доля ширины коллажа;
 * `h` — высота картинки к ширине (для проверки, что наклейка в рамке).
 * Порядок в списке — порядок появления; логотип — последний, поверх всех.
 */

export interface Spot {
  x: number;
  y: number;
  w: number;
}

export interface Sticker {
  name: string;
  /** Высота картинки к её ширине. */
  h: number;
  /** Наклон, градусы. */
  rotate: number;
  narrow: Spot | null;
  wide: Spot;
}

export const STICKERS: Sticker[] = [
  { name: "asterisk", h: 1.02, rotate: -14, narrow: { x: 16, y: 17, w: 26 }, wide: { x: 21, y: 23, w: 15 } },
  { name: "star", h: 0.97, rotate: 12, narrow: { x: 83, y: 16, w: 24 }, wide: { x: 79, y: 21, w: 14 } },
  { name: "smile", h: 1.06, rotate: -8, narrow: { x: 10, y: 50, w: 20 }, wide: { x: 13, y: 55, w: 13 } },
  { name: "cursor", h: 1.29, rotate: 16, narrow: { x: 91, y: 48, w: 14 }, wide: { x: 87, y: 52, w: 9 } },
  { name: "mascot-yellow", h: 0.88, rotate: -6, narrow: { x: 50, y: 9, w: 24 }, wide: { x: 39, y: 12, w: 13 } },
  { name: "heart", h: 0.88, rotate: 10, narrow: { x: 19, y: 85, w: 25 }, wide: { x: 24, y: 83, w: 15 } },
  { name: "flame", h: 1.34, rotate: -12, narrow: { x: 82, y: 84, w: 16 }, wide: { x: 75, y: 82, w: 10 } },
  { name: "logo-short", h: 1, rotate: 14, narrow: null, wide: { x: 8, y: 83, w: 10 } },
  { name: "mascot-blue", h: 1.01, rotate: 8, narrow: { x: 52, y: 92, w: 21 }, wide: { x: 62, y: 89, w: 13 } },
  { name: "logo", h: 1, rotate: -4, narrow: { x: 50, y: 50, w: 62 }, wide: { x: 50, y: 50, w: 40 } },
];

/** Соотношение сторон коллажа: высота к ширине. */
export const FRAME = { narrow: 1, wide: 10 / 16 };
