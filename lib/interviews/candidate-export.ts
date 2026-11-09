import ExcelJS from "exceljs";
import { db } from "~~/lib/db";
import { fullName } from "~~/lib/applications/staff";
import { displayName } from "~~/lib/auth/actor";
import { botWhen } from "./bot-rules";

type Cell = string | number | boolean | Date | null | undefined;
const when = (date: Date | null | undefined) => date ? botWhen(date) : "";
const value = (input: unknown) => typeof input === "string" ? input : input == null ? "" : JSON.stringify(input);
/** Google Sheets interprets leading operators as formulas during import. */
export function safeExportCell(input: Cell): string | number | boolean {
  if (input == null) return "";
  if (input instanceof Date) return when(input);
  if (typeof input !== "string") return input;
  const clean = Array.from(input).filter(char => char.charCodeAt(0) >= 32 || char === "\n" || char === "\t").join("");
  return /^\s*[=+\-@]/.test(clean) ? `'${clean}` : clean;
}
function sheet(book: ExcelJS.Workbook, name: string, headings: string[], rows: Cell[][]) {
  const page = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  page.addRow(headings);
  for (const row of rows) page.addRow(row.map(safeExportCell));
  page.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  page.getRow(1).eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242424" } }; cell.alignment = { vertical: "middle", wrapText: true }; });
  page.getRow(1).height = 30;
  for (let column = 1; column <= headings.length; column++) page.getColumn(column).width = column <= 2 ? 27 : 42;
  for (let row = 2; row <= page.rowCount; row++) {
    page.getRow(row).alignment = { vertical: "top", wrapText: true };
    if (row % 2 === 0) page.getRow(row).eachCell({ includeEmpty: true }, cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F7FA" } }; });
  }
  page.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, page.rowCount), column: headings.length } };
}

/** Операционная копия данных текущего сезона для работы без сайта. */
export async function candidateExportFile(
  seasonId: string,
  options: { applicationIds?: readonly string[]; workbook?: ExcelJS.Workbook } = {},
) {
  const apps = await db.application.findMany({
    where: { seasonId, ...(options.applicationIds ? { id: { in: [...options.applicationIds] } } : {}) }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    include: {
      user: { select: { email: true, login: true, telegramId: true, telegramUsername: true, phone: true, course: true, faculty: true, studentId: true, status: true } },
      answers: { include: { question: { select: { stageKind: true, section: true, order: true, label: true } } } },
      submissions: { include: { upload: { select: { filename: true } } } },
      reviews: { include: { reviewer: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } }, scores: { include: { criterion: { select: { title: true, maxScore: true } } } }, markers: { include: { marker: { select: { title: true } } } } } },
      decisions: { include: { decidedBy: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } } },
      assessmentInvite: { include: { session: { select: { title: true, building: true, room: true, startsAt: true, reserve: true } } } },
      assessment: { include: { group: { select: { title: true, building: true, room: true, startsAt: true } } } },
      assessmentTaskNotes: { include: { task: { select: { title: true } }, author: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } } },
      bookings: {
        include: {
          slot: {
            include: {
              interviewers: {
                include: { user: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } },
              },
            },
          },
        },
      },
      interviewNotes: { include: { question: { select: { block: true, text: true } }, author: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } } },
      finalDecisionComments: { include: { author: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const book = options.workbook ?? new ExcelJS.Workbook();
  book.creator = "Школа Актива";
  sheet(book, "Кандидаты", ["ID анкеты", "ФИО", "Статус анкеты", "Отправлена", "Факультет", "Курс", "Студбилет", "Телефон", "Telegram", "Telegram ID", "Почта", "Логин", "Статус аккаунта", "Явка ЦО", "Ответ на ЦО", "Собес: дата и время", "Корпус собеса", "Перезаписей"], apps.map(a => {
    const active = a.bookings.find(b => !b.cancelledAt);
    return [a.id, fullName(a), a.status, when(a.submittedAt), a.user.faculty, a.user.course, a.studentId ?? a.user.studentId, a.user.phone, a.user.telegramUsername ? `@${a.user.telegramUsername}` : "", a.user.telegramId, a.user.email, a.user.login, a.user.status, a.assessmentInvite?.attended ? "Да" : "Нет", a.assessmentInvite?.answer ?? "", when(active?.slot.startsAt), active?.slot.location, a.interviewReschedulesUsed];
  }));
  sheet(book, "Ответы анкеты", ["ID анкеты", "ФИО", "Этап", "Раздел", "№", "Вопрос", "Ответ"], apps.flatMap(a => a.answers.sort((x, y) => x.question.order - y.question.order).map(answer => [a.id, fullName(a), answer.question.stageKind, answer.question.section, answer.question.order, answer.question.label, value(answer.value)])));
  sheet(book, "Домашние задания", ["ID анкеты", "ФИО", "Этап", "Текст или ссылка", "Файл", "Отправлено", "Заменено"], apps.flatMap(a => a.submissions.map(s => [a.id, fullName(a), s.stageKind, s.text, s.upload?.filename, when(s.submittedAt), when(s.replacedAt)])));
  sheet(book, "Оценки", ["ID анкеты", "ФИО", "Этап", "Мастер", "Критерий", "Балл", "Максимум", "Комментарий к критерию", "Общий комментарий", "Назначено", "Освобождено"], apps.flatMap(a => a.reviews.flatMap(r => (r.scores.length ? r.scores : [null]).map(s => [a.id, fullName(a), r.stageKind, displayName(r.reviewer), s?.criterion.title, s?.score, s?.criterion.maxScore, s?.comment, r.comment, when(r.assignedAt), when(r.releasedAt)]))));
  sheet(book, "Маркеры", ["ID анкеты", "ФИО", "Этап", "Мастер", "Маркер", "Комментарий"], apps.flatMap(a => a.reviews.flatMap(r => r.markers.map(m => [a.id, fullName(a), r.stageKind, displayName(r.reviewer), m.marker.title, m.note]))));
  sheet(book, "ЦО", ["ID анкеты", "ФИО", "Приглашение", "Ответ", "Явка", "Резервная очередь", "Резерв предложен", "Сбор", "Время сбора", "Корпус", "Аудитория", "Подгруппа", "Время подгруппы", "Корпус подгруппы"], apps.map(a => [a.id, fullName(a), when(a.assessmentInvite?.invitedAt), a.assessmentInvite?.answer, a.assessmentInvite?.attended ? "Да" : "Нет", a.assessmentInvite?.reserveQueued ? "Да" : "Нет", a.assessmentInvite?.reserveOffered ? "Да" : "Нет", a.assessmentInvite?.session.title, when(a.assessmentInvite?.session.startsAt), a.assessmentInvite?.session.building, a.assessmentInvite?.session.room, a.assessment?.group.title, when(a.assessment?.group.startsAt), a.assessment?.group.building]));
  sheet(book, "Комментарии ЦО", ["ID анкеты", "ФИО", "Задание", "Эксперт", "Комментарий"], apps.flatMap(a => a.assessmentTaskNotes.map(n => [a.id, fullName(a), n.task.title, displayName(n.author), n.text])));
  sheet(book, "Собеседования", ["ID анкеты", "ФИО", "Дата и время", "Конец", "Корпус", "Аудитория", "Мастер", "Записан", "Отменён"], apps.flatMap(a => a.bookings.flatMap(b => (b.slot.interviewers.length ? b.slot.interviewers : [null]).map(i => [a.id, fullName(a), when(b.slot.startsAt), when(b.slot.endsAt), b.slot.location, b.slot.room, i ? displayName(i.user) : "", when(b.createdAt), when(b.cancelledAt)]))));
  sheet(book, "Комментарии собесов", ["ID анкеты", "ФИО", "Блок", "Вопрос", "Мастер", "Комментарий"], apps.flatMap(a => a.interviewNotes.map(n => [a.id, fullName(a), n.question.block, n.question.text, displayName(n.author), n.note])));
  sheet(book, "Решения", ["ID анкеты", "ФИО", "Этап", "Решение", "Кто принял", "Принято", "Опубликовано"], apps.flatMap(a => a.decisions.map(d => [a.id, fullName(a), d.stageKind, d.outcome, d.decidedBy ? displayName(d.decidedBy) : "", when(d.decidedAt), when(d.publishedAt)])));
  sheet(book, "Комментарии итогов", ["ID анкеты", "ФИО", "Организатор", "Комментарий", "Добавлен"], apps.flatMap(a => a.finalDecisionComments.map(c => [a.id, fullName(a), c.author ? displayName(c.author) : "Организатор", c.body, when(c.createdAt)])));
  return { bytes: Buffer.from(await book.xlsx.writeBuffer()), candidates: apps.length };
}
