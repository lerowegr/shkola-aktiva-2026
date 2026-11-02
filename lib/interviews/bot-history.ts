import { fullName } from "~~/lib/applications/staff";
import { loadReviewHistory, type ReviewHistory } from "~~/lib/applications/history";
import { interviewBotActor, loadBotSlot } from "./bot-staff";

export function reviewHistoryText(history: ReviewHistory): string {
  return history.stages.map(stage => {
    const lines = [stage.label.toUpperCase()];
    if (!stage.reviews.length) lines.push("Оценок пока нет.");
    for (const r of stage.reviews) {
      lines.push(`\nМастер: ${r.reviewer}`, `Итог: ${r.total ?? "—"}/${r.max}${r.percent === null ? " · оценка не завершена" : ` · ${r.percent}%`}`);
      for (const c of r.criteria) {
        lines.push(`• ${c.title}: ${c.score ?? "—"}/${c.max}`);
        if (c.comment) lines.push(`Комментарий к критерию: ${c.comment}`);
      }
      for (const m of r.markers) lines.push(`Маркер «${m.title}»: ${m.note}`);
      if (r.comment) lines.push(`Общий комментарий: ${r.comment}`);
    }
    return lines.join("\n");
  }).join("\n\n────────────────\n\n");
}
/** Без потери текста и без разрыва UTF-16 суррогатной пары. */
export function botTextPages(text: string): string[] {
  const pages: string[] = [];
  for (let at = 0; at < text.length;) {
    let end = Math.min(at + 3400, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
    pages.push(text.slice(at, end)); at = end;
  }
  return pages.length ? pages : ["Данных пока нет."];
}
export async function botReviewHistory(telegramId: string, slotId: string) {
  const actor = await interviewBotActor(telegramId), slot = await loadBotSlot(telegramId, slotId);
  if (!actor || !slot) return null;
  const app = slot.bookings[0]?.application;
  if (!app) return null;
  const history = await loadReviewHistory(app.id, slot.seasonId, actor);
  if (!history) return null;
  return { name: fullName(app), pages: botTextPages(reviewHistoryText(history)) };
}
