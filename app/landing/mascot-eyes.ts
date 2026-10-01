/**
 * Где у маскотов глаза — в пикселях картинок public/brand/mascots/*.webp.
 *
 * Глаза нарисованы мелком прямо на картинке. Найдены автоматически (белые
 * овалы с тёмным зрачком) и проверены наложением; поверх кладутся свои
 * белок и зрачок, которые смотрят на указатель. Сменили картинку маскота —
 * пересчитайте координаты.
 */
export interface MascotEyes {
  width: number;
  height: number;
  eyes: { x: number; y: number; rx: number; ry: number }[];
}

export const MASCOT_EYES = {
  "green": { width: 285, height: 156, eyes: [{ x: 107, y: 85.5, rx: 25.5, ry: 28 }, { x: 163.5, y: 84.5, rx: 24, ry: 28 }] },
  "purple": { width: 275, height: 212, eyes: [{ x: 124, y: 130.5, rx: 25.5, ry: 29 }, { x: 180, y: 128.5, rx: 25.5, ry: 29 }] },
  "blue-a": { width: 262, height: 265, eyes: [{ x: 108, y: 115.5, rx: 24.5, ry: 28 }, { x: 162.5, y: 114, rx: 25, ry: 27.5 }] },
  "yellow-b": { width: 267, height: 232, eyes: [{ x: 116, y: 112, rx: 24.5, ry: 28.5 }, { x: 170, y: 112, rx: 23.5, ry: 27.5 }] },
} satisfies Record<string, MascotEyes>;

export type EyedMascot = keyof typeof MASCOT_EYES;
