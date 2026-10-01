import { hasContent } from "~~/lib/site/content";
import { loadSiteContent } from "~~/lib/site/store";
import { currentSeason } from "~~/lib/stages";

/**
 * llms.txt — краткая выжимка сайта для нейросетевых поисковиков: что за
 * Школа, как идёт отбор и когда, частые вопросы. Собирается из тех же
 * текстов и дат, что и главная, поэтому не расходится с ней.
 */
const day = (date: Date) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(date);

export default defineEventHandler(async (event) => {
  const url = useRuntimeConfig(event).public.appUrl.replace(/\/$/, "");
  const season = await currentSeason();
  setHeader(event, "Content-Type", "text/markdown; charset=utf-8");
  if (!season) return `# Школа Актива\n\nСайт: ${url}/\n`;

  const content = await loadSiteContent(season.id);
  const lines = [`# Школа Актива ${season.year}`, "", `> ${content.hero.tagline}`, "", `Сайт и регистрация: ${url}/`, ""];

  if (hasContent(content, "about")) {
    lines.push(`## ${content.about.title}`, "", content.about.text, ...content.about.points.map((point) => `- ${point}`), "");
  }

  lines.push(`## ${content.selection.title}`, "");
  if (content.selection.intro) lines.push(content.selection.intro, "");
  for (const stage of season.stages) {
    const when =
      stage.opensAt && stage.closesAt
        ? `с ${day(stage.opensAt)} по ${day(stage.closesAt)}`
        : stage.opensAt
          ? `с ${day(stage.opensAt)}`
          : "даты объявят позже";
    lines.push(`- ${stage.title} (${when}): ${content.selection.steps[stage.kind]}`);
  }
  lines.push("");

  for (const key of ["program", "roles"] as const) {
    if (!hasContent(content, key)) continue;
    lines.push(`## ${content[key].title}`, "", ...content[key].items.map((item) => `- ${item.title}: ${item.text}`), "");
  }
  if (hasContent(content, "venue")) {
    const { venue } = content;
    lines.push(`## ${venue.title}`, "", [venue.place, venue.dates].filter(Boolean).join(", "), venue.text, "");
  }
  if (hasContent(content, "faq")) {
    lines.push(`## ${content.faq.title}`, "");
    for (const item of content.faq.items) lines.push(`### ${item.question}`, "", item.answer, "");
  }
  return lines.join("\n");
});
