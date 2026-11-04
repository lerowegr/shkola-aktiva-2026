import {
  facultyOutcomes,
  finalScores,
  funnel,
  messageBacklog,
  milestonesByDay,
  notBooked,
  reviewerAgreement,
  scoreGaps,
  speed,
  todayBoard,
  deliveries,
  engagement,
  freeSeats,
} from "./dashboards";
import type { FacultyFilter } from "./profile/faculty";

/**
 * CSV для дашбордов: тот же отчёт, что на экране, одной таблицей.
 * Excel открывает с запятой в уме: разделитель «;», числа с точкой,
 * в начале BOM, чтобы кириллица не поехала.
 */
export const DASHBOARD_REPORTS = {
  funnel: "Воронка",
  seats: "Свободные места на собеседования",
  not_booked: "Не записавшиеся",
  backlog: "Долги по переписке",
  agreement: "Согласованность мастеров",
  speed: "Скорость обработки",
  gaps: "Разрывы баллов",
  final: "Итоговые баллы",
  faculty: "Итоги по факультетам",
  deliveries: "Уведомления по дням",
  engagement: "Вовлечённость",
  today: "Сейчас",
  flow: "Кто когда проходил",
  faculties: "Факультеты по этапам",
} as const;

export type DashboardReport = keyof typeof DASHBOARD_REPORTS;

export interface DashboardExportFilters {
  faculty?: FacultyFilter;
  course?: string;
  day?: string;
}

export interface DashboardCsvFile {
  filename: string;
  text: string;
}

function csv(rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return "\uFEFF" + rows.map((row) => row.map(escape).join(";")).join("\r\n") + "\r\n";
}

const STAGE_LABELS = { APPLICATION: "Анкета", HOMEWORK: "Домашнее задание", INTERVIEW: "Собеседование" } as const;
const PART_LABELS = { APPLICATION: "Анкета", HOMEWORK: "ДЗ", ASSESSMENT: "ЦО", INTERVIEW: "Собеседование" } as const;
const CATEGORY_LABELS = { SELECTION: "Отбор", MESSAGES: "Сообщения", REVIEW: "Оценка", SYSTEM: "Важное" } as const;

const DASHBOARD_CSV_BUILDERS: {
  [K in DashboardReport]: (
    seasonId: string,
    filters: DashboardExportFilters,
    now: Date,
  ) => Promise<(string | number | null | undefined)[][] | null>;
} = {
  flow: async (seasonId, filters, now) => {
    const report = await milestonesByDay(seasonId, filters, now);
    return [
      ["День", "Отправили анкету", "Пришли на ЦО", "Собеседования", "Приняты"],
      ...report.days.map((row) => [row.day, row.submitted, row.assessment, row.interviews, row.accepted]),
      [],
      ["Итого", report.totals.submitted, report.totals.assessment, report.totals.interviews, report.totals.accepted],
    ];
  },
  faculties: async (seasonId, filters) => {
    const report = await milestonesByDay(seasonId, filters);
    return [
      ["Факультет", "Отправили анкету", "Пришли на ЦО", "Собеседования", "Приняты"],
      ...report.faculties.map((row) => [row.faculty ?? "Не указан", row.submitted, row.assessment, row.interviews, row.accepted]),
      [],
      ["По корпусам"],
      ["Корпус", "Явка на ЦО", "Собеседования"],
      ...report.buildings.map((row) => [row.building, row.assessment, row.interviews]),
    ];
  },
  funnel: async (seasonId, filters) => {
    const steps = await funnel(seasonId, filters);
    return [["Шаг", "Человек"], ...steps.map((step) => [step.label, step.count])];
  },
  seats: async (seasonId, filters) => {
    const report = await freeSeats(seasonId, filters);
    return [
      ["День", "Корпус", "Слотов", "Записано", "Свободно"],
      ...report.rows.map((row) => [row.day, row.location, row.slots, row.booked, Math.max(0, row.slots - row.booked)]),
      [],
      ["Отправили анкету, но не записались", report.notBooked],
      ["Из них могут записаться (были на ЦО)", report.eligibleNotBooked],
    ];
  },
  not_booked: async (seasonId, filters, now) => {
    const report = await notBooked(seasonId, filters, now);
    return [
      ["Не ответили на приглашение на ЦО"],
      ["Кандидат", "Факультет"],
      ...report.assessment.rows.map((row) => [row.name, row.faculty ?? "Не указан"]),
      [],
      ["Были на ЦО, но не записались на собеседование"],
      ["Кандидат", "Факультет", "Дней до последнего дня собеседований"],
      ...report.interview.rows.map((row) => [row.name, row.faculty ?? "Не указан", row.daysLeft]),
    ];
  },
  backlog: async (seasonId, filters, now) => {
    const report = await messageBacklog(seasonId, filters, now);
    return [
      ["Кандидат", "Факультет", "Ждёт ответа, часов", "Последний ответ организаторов"],
      ...report.rows.map((row) => [row.name, row.faculty ?? "Не указан", row.waitingHours, row.lastByStaff ?? "ответа не было"]),
    ];
  },
  agreement: async (seasonId) => {
    const report = await reviewerAgreement(seasonId);
    const rows: (string | number | null)[][] = [["Этап", "Критерий", "Максимум", "Средний по всем", "Мастер", "Средний мастера", "Оценок"]];
    for (const [stage, criteria] of Object.entries(report)) {
      for (const criterion of criteria) {
        for (const reviewer of criterion.reviewers) {
          rows.push([
            STAGE_LABELS[stage as keyof typeof STAGE_LABELS],
            criterion.title,
            criterion.maxScore,
            criterion.overall,
            reviewer.name,
            reviewer.mean,
            reviewer.n,
          ]);
        }
        if (!criterion.reviewers.length) {
          rows.push([STAGE_LABELS[stage as keyof typeof STAGE_LABELS], criterion.title, criterion.maxScore, criterion.overall, "—", null, 0]);
        }
      }
    }
    return rows;
  },
  speed: async (seasonId) => {
    const report = await speed(seasonId);
    return [
      ["Этап", "Медиана минут до первой оценки", "Кандидатов с оценкой"],
      ...report.stages.map((stage) => [STAGE_LABELS[stage.stage], stage.medianMinutes, stage.samples]),
      [],
      ["От записи до собеседования, часов (медиана)", report.bookingLeadHours, report.bookingSamples],
    ];
  },
  gaps: async (seasonId, filters) => {
    const report = await scoreGaps(seasonId, filters);
    return [
      ["Кандидат", "Факультет", "Анкета, %", "ДЗ, %", "ЦО, %", "Собеседование, %", "Разрыв, пункты"],
      ...report.rows.map((row) => [row.name, row.faculty ?? "Не указан", row.application, row.homework, row.assessment, row.interview, row.gap]),
    ];
  },
  final: async (seasonId, filters) => {
    const report = await finalScores(seasonId, filters);
    return [
      ["Итог", "Кандидатов"],
      ...report.histogram.flatMap((count, index) => (count ? [[index, count] as (string | number)[]] : [])),
      [],
      ["Средний балл по этапам"],
      ["Этап", "Средний", "Максимум"],
      ...report.stageMeans.map((part) => [PART_LABELS[part.stage], part.mean, part.max]),
      [],
      ["Итог посчитан у", report.count, "средний", report.mean],
      ["Прошли (опубликовано)", report.accepted],
      ["Не прошли (опубликовано)", report.rejected],
    ];
  },
  faculty: async (seasonId, filters) => {
    const rows = await facultyOutcomes(seasonId, filters);
    return [
      ["Факультет", "Отправили анкету", "Прошли", "Не прошли", "Ждут итогов", "Средний итог"],
      ...rows.map((row) => [row.faculty ?? "Не указан", row.submitted, row.accepted, row.rejected, row.pending, row.meanFinal]),
    ];
  },
  deliveries: async (seasonId, _filters, now) => {
    const report = await deliveries(seasonId, 14, now);
    return [
      ["День", "Ушло", "Не дошло", "Пропущено"],
      ...report.days.map((row) => [row.day, row.sent, row.failed, row.skipped]),
      [],
      ["Тема", "Создано", "Ушло", "Не дошло"],
      ...report.categories.map((row) => [CATEGORY_LABELS[row.category as keyof typeof CATEGORY_LABELS] ?? row.category, row.created, row.sent, row.failed]),
    ];
  },
  engagement: async (seasonId, _filters, now) => {
    const report = await engagement(seasonId, now);
    return [
      ["Играли в мини-игры", report.games.players, "партий", report.games.plays],
      ["Играли за 7 дней", report.games.players7, "партий за 7 дней", report.games.plays7],
      ["Прошли «Тест про ША»", report.quiz.takers, "средний результат, %", report.quiz.meanPercent],
      ["Решали задание дня", report.daily.solvers, "за последние 7 дней", report.daily.solvers7],
      [],
      ["Этап", "Человек", "Из них играли"],
      ...report.byStage.map((row) => [row.label, row.total, row.players]),
    ];
  },
  today: async (seasonId, filters, now) => {
    const board = await todayBoard(seasonId, filters, now);
    return [
      ["День", board.day],
      [],
      ["Корпус", "Слотов", "Записано"],
      ...board.places.map((row) => [row.location, row.slots, row.booked]),
      [],
      ["ЦО этого дня: пришли", board.assessment.attended, "не явились", board.assessment.missed, "день ещё не прошёл", board.assessment.pending],
      ["Отмен записей за день", board.reschedules],
      ["Переписок ждут ответа дольше 6 часов", board.waiting],
      [],
      ["Встречи дня"],
      ["Время", "Кандидат", "Место", "Аудитория", "Началась"],
      ...board.upcoming.map((row) => [row.time, row.candidate, row.location, row.room, row.started ? "да" : "нет"]),
    ];
  },
};

export async function dashboardCsv(
  seasonId: string,
  report: DashboardReport,
  filters: DashboardExportFilters = {},
  now = new Date(),
): Promise<DashboardCsvFile | null> {
  const rows = await DASHBOARD_CSV_BUILDERS[report](seasonId, filters, now);
  if (!rows) return null;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(now);
  return {
    filename: `sha-${report}-${day}.csv`,
    text: csv(rows),
  };
}
