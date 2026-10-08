import { csvCell } from "~~/lib/games/sha-test";
import { testRows } from "~~/lib/games/sha-test-store";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/**
 * Участники теста в CSV для русского Excel: «;», BOM, по колонке на вопрос
 * (1/0) и на его время в секундах. Здесь ФИО и телефоны — поэтому право
 * видеть все анкеты, и выгрузка пишется в журнал.
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "applications.view_all");
  const rows = await testRows(await requireCurrentSeasonId());
  const width = Math.max(0, ...rows.map((row) => row.answers.length));

  const moscow = (date: Date) =>
    new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(date);

  const head = [
    "ФИО", "Telegram", "Курс", "Факультет", "Студбилет", "Телефон", "Балл", "Из", "Время, с", "Где прошёл", "Когда (МСК)",
    ...Array.from({ length: width }, (_, i) => `в${i + 1}`),
    ...Array.from({ length: width }, (_, i) => `в${i + 1}, с`),
  ];
  const lines = rows.map((row) =>
    [
      row.name, row.telegram, row.course, row.faculty, row.studentId, row.phone, row.score, row.total,
      Math.round(row.durationMs / 100) / 10, row.source === "BOT" ? "бот" : "сайт", moscow(row.completedAt),
      ...Array.from({ length: width }, (_, i) => (row.answers[i] ? (row.answers[i]!.correct ? 1 : 0) : "")),
      ...Array.from({ length: width }, (_, i) => (row.answers[i] ? Math.round(row.answers[i]!.ms / 100) / 10 : "")),
    ]
      .map(csvCell)
      .join(";"),
  );

  await audit(event, { actorId: user.id, action: "quiz.export", meta: { rows: rows.length } });

  setHeader(event, "content-type", "text/csv; charset=utf-8");
  setHeader(event, "content-disposition", `attachment; filename="sha-test.csv"`);
  setHeader(event, "cache-control", "no-store");
  return `\uFEFF${[head.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
});
