/**
 * Цвет кружка с инициалами — один из светлых цветов бренда, всегда один и
 * тот же для одного человека: так глаз быстрее находит его в списке.
 */
const TONES = [
  "bg-brand-green-soft text-[#1c6b12]",
  "bg-brand-purple-soft text-[#6a1a91]",
  "bg-brand-orange-soft text-[#8a4200]",
  "bg-brand-blue-soft text-[#10389a]",
  "bg-brand-yellow-soft text-[#7a5d00]",
  "bg-brand-red-soft text-[#8f0f0e]",
];

export function avatarTone(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

/** Две буквы для кружка: «Катя Белова» → «КБ», «@ivan_p» → «I». */
export function initialsOf(name: string): string {
  const words = name.replace(/^@/, "").split(/[\s@.]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}
