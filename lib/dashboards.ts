import { db } from "~~/lib/db";
import type { StageKind } from "~~/lib/generated/prisma/enums";

import type { FinalPart } from "./applications/decisions";
import { reviewSummary } from "./applications/review";
import { attendanceDay, missedAssessment, mskDayKey, slotStartsAt } from "./assessment/rules";
import { displayName } from "./auth/actor";
import { NO_FACULTY, facultyMatches, type FacultyFilter } from "./profile/faculty";

/**
 * Цифры для дашбордов. Только чтение и подсчёт: кто вправе смотреть,
 * решает обработчик. Дни считаются по Москве — «заявки за вторник» должны
 * быть заявками за московский вторник, где бы ни стоял сервер.
 */
type Evaluated = Extract<StageKind, "APPLICATION" | "HOMEWORK" | "INTERVIEW">;

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

/** Срез воронки: факультет, курс и вариант ответа «откуда узнал». */
export interface FunnelSlice {
  faculty?: FacultyFilter;
  course?: string;
  source?: string;
}

const userSliceWhere = (slice: FunnelSlice) => ({
  ...(slice.faculty ? { faculty: slice.faculty === NO_FACULTY ? null : slice.faculty } : {}),
  ...(slice.course ? { course: slice.course } : {}),
});

export async function funnel(seasonId: string, slice: FunnelSlice = {}): Promise<FunnelStep[]> {
  // Вариант ответа «откуда узнал» фильтруется по ответам анкеты — так его
  // может задать только отправивший анкету, для шага «вошли» он неприменим.
  let sourceIds: Set<string> | null = null;
  if (slice.source) {
    const question = await db.formQuestion.findFirst({
      where: { seasonId, stageKind: "APPLICATION", label: { contains: "узнал", mode: "insensitive" } },
      select: { id: true },
    });
    const answers = question
      ? await db.answer.findMany({
          where: { questionId: question.id, application: { seasonId, status: "SUBMITTED" } },
          select: { applicationId: true, value: true },
        })
      : [];
    sourceIds = new Set(
      answers
        .filter((answer) =>
          (Array.isArray(answer.value) ? answer.value : [answer.value]).includes(slice.source!),
        )
        .map((answer) => answer.applicationId),
    );
  }

  const [registered, applications] = await Promise.all([
    db.user.count({ where: { isOwner: false, roles: { none: {} }, ...userSliceWhere(slice) } }),
    db.application.findMany({
      where: { seasonId, user: userSliceWhere(slice) },
      select: {
        id: true,
        status: true,
        submissions: { where: { stageKind: "HOMEWORK", replacedAt: null }, select: { id: true } },
        assessmentInvite: { select: { answer: true, reserveQueued: true } },
        bookings: { where: { cancelledAt: null }, select: { id: true } },
        decisions: {
          where: { stageKind: "INTERVIEW", outcome: "PASSED", publishedAt: { not: null } },
          select: { id: true },
        },
      },
    }),
  ]);

  const inSlice = (id: string) => !sourceIds || sourceIds.has(id);
  const count = (predicate: (application: (typeof applications)[number]) => boolean) =>
    applications.filter((application) => inSlice(application.id) && predicate(application)).length;

  // Воронка показывает, кто дошёл до каждого шага; запись требует явки на ЦО.
  return [
    { key: "registered", label: "Вошли на сайт", count: registered },
    { key: "started", label: "Начали анкету", count: applications.filter((a) => inSlice(a.id)).length },
    { key: "submitted", label: "Отправили анкету", count: count((a) => a.status === "SUBMITTED") },
    { key: "homework", label: "Сдали ДЗ", count: count((a) => a.submissions.length > 0) },
    {
      key: "assessment",
      label: "Придут на ЦО",
      count: count(
        (a) => a.assessmentInvite !== null && ["GOING", "RESERVE"].includes(a.assessmentInvite.answer ?? "") && !a.assessmentInvite.reserveQueued,
      ),
    },
    { key: "booked", label: "Записались на собеседование", count: count((a) => a.bookings.length > 0) },
    { key: "accepted", label: "Прошли отбор", count: count((a) => a.decisions.length > 0) },
  ];
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD по Москве
  registered: number;
  submitted: number;
}

/** Входы новых кандидатов и отправленные анкеты по дням за последние N дней. */
export async function daily(
  seasonId: string,
  days = 30,
  now = new Date(),
): Promise<DailyPoint[]> {
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [registered, submitted] = await Promise.all([
    db.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day, count(*) AS n
      FROM users u
      WHERE u."createdAt" >= ${from} AND u."isOwner" = false
        AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r."userId" = u.id)
      GROUP BY 1`,
    db.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT to_char(("submittedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day, count(*) AS n
      FROM applications
      WHERE "seasonId" = ${seasonId} AND status = 'SUBMITTED' AND "submittedAt" >= ${from}
      GROUP BY 1`,
  ]);

  const reg = new Map(registered.map((row) => [row.day, Number(row.n)]));
  const sub = new Map(submitted.map((row) => [row.day, Number(row.n)]));

  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
    }).format(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    points.push({
      day,
      registered: reg.get(day) ?? 0,
      submitted: sub.get(day) ?? 0,
    });
  }
  return points;
}

export interface ReportFilters {
  faculty?: FacultyFilter;
  assessmentDay?: string;
  interviewDay?: string;
}

export interface AssessmentDayPoint {
  day: string; // YYYY-MM-DD по Москве
  /** В этот день есть резервный сбор. */
  reserve: boolean;
  attended: number;
  missed: number;
  /** Подтвердились, но день ещё не прошёл. */
  pending: number;
}

export interface ConversionStep {
  key: "attended" | "booked" | "scored" | "accepted";
  label: string;
  count: number;
}

export interface AssessmentReport {
  days: AssessmentDayPoint[];
  /** Все дни сезона — для выпадающего списка, даже когда выбран один. */
  options: { day: string; reserve: boolean }[];
  conversion: ConversionStep[];
}

export interface InterviewDayPoint {
  day: string; // YYYY-MM-DD по Москве
  slots: number;
  /** Активные записи на этот день. */
  booked: number;
  /** Из записавшихся уже получили оценку собеседования. */
  scored: number;
}

export interface InterviewReport {
  days: InterviewDayPoint[];
  options: { day: string }[];
}

/**
 * ЦО: сколько пришло и сколько не пришло по дням, плюс конверсия
 * пришедших. Прогул вычисляется, а не хранится: день своего сбора прошёл,
 * отметки «пришёл» нет. Неответившие и «не смогу» в прогульщики не попадают.
 */
export async function assessmentReport(
  seasonId: string,
  filters: ReportFilters = {},
  now = new Date(),
): Promise<AssessmentReport> {
  const faculty = filters.faculty ?? "";
  const dayFilter = filters.assessmentDay || null;

  const [sessions, reserve, interviewCriteria, applications] = await Promise.all([
    db.assessmentSession.findMany({
      where: { seasonId },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, reserve: true, invited: true },
    }),
    db.assessmentSession.findFirst({
      where: { seasonId, reserve: true },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: { startsAt: true, invited: true },
    }),
    db.criterion.findMany({
      where: { seasonId, stageKind: "INTERVIEW" },
      select: { id: true, maxScore: true },
    }),
    db.application.findMany({
      where: { seasonId, status: "SUBMITTED", assessmentInvite: { isNot: null } },
      select: {
        user: { select: { faculty: true } },
        assessmentInvite: {
          select: {
            attended: true,
            answer: true,
            reserveQueued: true,
            session: { select: { startsAt: true, invited: true } },
          },
        },
        bookings: {
          where: { cancelledAt: null },
          select: { slot: { select: { startsAt: true } } },
        },
        reviews: {
          where: { stageKind: "INTERVIEW" },
          select: { scores: { select: { criterionId: true, score: true } } },
        },
        decisions: {
          where: { stageKind: "INTERVIEW" },
          select: { outcome: true, publishedAt: true },
        },
      },
    }),
  ]);

  const optionMap = new Map<string, boolean>();
  for (const session of sessions) {
    const day = mskDayKey(slotStartsAt(session));
    optionMap.set(day, (optionMap.get(day) ?? false) || session.reserve);
  }
  const options = [...optionMap.entries()]
    .map(([day, reserve]) => ({ day, reserve }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const points = new Map<string, AssessmentDayPoint>();
  for (const option of options) {
    if (dayFilter && option.day !== dayFilter) continue;
    points.set(option.day, { ...option, attended: 0, missed: 0, pending: 0 });
  }

  const reserveStartsAt = reserve ? slotStartsAt(reserve) : null;
  const cohort: typeof applications = [];
  const dayOfApplication = (application: (typeof applications)[number]) => {
    const invite = application.assessmentInvite;
    if (!invite) return null;
    return attendanceDay(
      {
        sessionStartsAt: slotStartsAt(invite.session),
        answer: invite.answer,
        reserveQueued: invite.reserveQueued,
        attended: invite.attended,
      },
      reserveStartsAt,
    );
  };

  for (const application of applications) {
    if (!facultyMatches(application.user.faculty, faculty)) continue;
    const invite = application.assessmentInvite;
    if (!invite) continue;

    const day = dayOfApplication(application);
    const dayKey = day ? mskDayKey(day) : null;

    if (dayKey && points.has(dayKey)) {
      const point = points.get(dayKey)!;
      if (invite.attended) point.attended++;
      else if (
        missedAssessment(
          {
            attended: invite.attended,
            answer: invite.answer,
            reserveQueued: invite.reserveQueued,
            sessionStartsAt: slotStartsAt(invite.session),
          },
          reserveStartsAt,
          now,
        )
      ) {
        point.missed++;
      } else {
        point.pending++;
      }
    }

    if (invite.attended && (!dayFilter || dayKey === dayFilter)) cohort.push(application);
  }

  const interviewDay = filters.interviewDay || null;
  const booked = cohort.filter((application) =>
    application.bookings.some((booking) => !interviewDay || mskDayKey(booking.slot.startsAt) === interviewDay),
  );
  const scored = booked.filter((application) =>
    application.reviews.some((review) => reviewSummary(interviewCriteria, review.scores).status === "done"),
  );
  const accepted = scored.filter((application) =>
    application.decisions.some((decision) => decision.outcome === "PASSED" && decision.publishedAt !== null),
  );

  return {
    days: [...points.values()].sort((a, b) => a.day.localeCompare(b.day)),
    options,
    conversion: [
      { key: "attended", label: "Пришли на ЦО", count: cohort.length },
      { key: "booked", label: "Записались на собеседование", count: booked.length },
      { key: "scored", label: "Получили оценки собеседования", count: scored.length },
      { key: "accepted", label: "Приняты в Школу", count: accepted.length },
    ],
  };
}

/**
 * Собеседования: загрузка по дням. «Получили оценки» — записавшиеся, у
 * которых хотя бы один мастер заполнил все критерии собеседования.
 * Отдельной отметки «пришёл» на собеседовании нет — считаем по записям.
 */
export async function interviewsReport(
  seasonId: string,
  filters: ReportFilters = {},
): Promise<InterviewReport> {
  const faculty = filters.faculty ?? "";
  const dayFilter = filters.interviewDay || null;

  const [criteria, slots] = await Promise.all([
    db.criterion.findMany({
      where: { seasonId, stageKind: "INTERVIEW" },
      select: { id: true, maxScore: true },
    }),
    db.interviewSlot.findMany({
      where: { seasonId, archivedAt: null },
      orderBy: { startsAt: "asc" },
      select: {
        startsAt: true,
        bookings: {
          where: { cancelledAt: null },
          select: {
            application: {
              select: {
                user: { select: { faculty: true } },
                reviews: {
                  where: { stageKind: "INTERVIEW" },
                  select: { scores: { select: { criterionId: true, score: true } } },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const options = [...new Set(slots.map((slot) => mskDayKey(slot.startsAt)))].sort().map((day) => ({ day }));

  const points = new Map<string, InterviewDayPoint>();
  for (const option of options) {
    if (dayFilter && option.day !== dayFilter) continue;
    points.set(option.day, { ...option, slots: 0, booked: 0, scored: 0 });
  }

  for (const slot of slots) {
    const day = mskDayKey(slot.startsAt);
    const point = points.get(day);
    if (!point) continue;
    point.slots++;

    for (const booking of slot.bookings) {
      if (!facultyMatches(booking.application.user.faculty, faculty)) continue;
      point.booked++;
      if (booking.application.reviews.some((review) => reviewSummary(criteria, review.scores).status === "done")) {
        point.scored++;
      }
    }
  }

  return {
    days: [...points.values()].sort((a, b) => a.day.localeCompare(b.day)),
    options,
  };
}

export interface ReviewerStats {
  id: string;
  name: string;
  avatar: string | null;
  assigned: number;
  done: number;
  /** Средний итог по полностью проверенным; null — проверенных нет. */
  average: number | null;
}

export interface StageStats {
  max: number;
  reviewers: ReviewerStats[];
  /** Сколько проверенных работ набрали каждый итог: index = балл. */
  histogram: number[];
  overall: number | null;
}

export async function stageStats(
  seasonId: string,
  stage: Evaluated,
): Promise<StageStats> {
  const [criteria, reviews] = await Promise.all([
    db.criterion.findMany({
      where: { seasonId, stageKind: stage },
      select: { id: true, maxScore: true },
    }),
    db.review.findMany({
      where: {
        stageKind: stage,
        application: { seasonId, status: "SUBMITTED" },
      },
      select: {
        reviewerId: true,
        reviewer: {
          select: {
            firstName: true,
            lastName: true,
            telegramUsername: true,
            email: true,
            avatarKey: true,
          },
        },
        scores: { select: { criterionId: true, score: true } },
      },
    }),
  ]);

  const max = criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  const histogram = Array.from({ length: max + 1 }, () => 0);
  const byReviewer = new Map<string, ReviewerStats & { totals: number[] }>();

  for (const review of reviews) {
    const summary = reviewSummary(criteria, review.scores);
    const row = byReviewer.get(review.reviewerId) ?? {
      id: review.reviewerId,
      name: displayName(review.reviewer),
      avatar: review.reviewer.avatarKey
        ? `/api/avatars/${review.reviewer.avatarKey}`
        : null,
      assigned: 0,
      done: 0,
      average: null,
      totals: [],
    };
    row.assigned++;
    if (summary.status === "done" && summary.total !== null) {
      row.done++;
      row.totals.push(summary.total);
      histogram[summary.total] = (histogram[summary.total] ?? 0) + 1;
    }
    byReviewer.set(review.reviewerId, row);
  }

  const mean = (values: number[]) =>
    values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
        10
      : null;
  const all = [...byReviewer.values()].flatMap((row) => row.totals);

  return {
    max,
    histogram,
    overall: mean(all),
    reviewers: [...byReviewer.values()]
      .map(({ totals, ...row }) => ({ ...row, average: mean(totals) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
}

export interface Breakdown {
  question: string;
  rows: { label: string; count: number }[];
}

/** Разрезы по вопросам с выбором (курс, форма обучения, откуда узнали) — по отправленным анкетам. */
export async function breakdowns(seasonId: string): Promise<Breakdown[]> {
  const questions = await db.formQuestion.findMany({
    where: {
      seasonId,
      stageKind: "APPLICATION",
      type: { in: ["SINGLE_CHOICE", "MULTI_CHOICE"] },
    },
    orderBy: { order: "asc" },
    select: {
      label: true,
      options: true,
      answers: {
        where: { application: { status: "SUBMITTED" } },
        select: { value: true },
      },
    },
  });

  return questions.map((question) => {
    const counts = new Map(question.options.map((option) => [option, 0]));
    for (const answer of question.answers) {
      for (const value of Array.isArray(answer.value)
        ? answer.value
        : [answer.value]) {
        if (typeof value === "string" && counts.has(value))
          counts.set(value, counts.get(value)! + 1);
      }
    }
    return {
      question: question.label,
      rows: [...counts.entries()].map(([label, count]) => ({ label, count })),
    };
  });
}

export interface ChannelStats {
  candidates: number;
  telegram: number;
  push: number;
  deliveries: {
    channel: "TELEGRAM" | "PUSH";
    sent: number;
    skipped: number;
    failed: number;
    pending: number;
  }[];
}

export async function channels(): Promise<ChannelStats> {
  const candidate = { isOwner: false, roles: { none: {} } };
  const [candidates, telegram, pushUsers, grouped] = await Promise.all([
    db.user.count({ where: candidate }),
    db.user.count({ where: { ...candidate, telegramId: { not: null } } }),
    db.pushSubscription.groupBy({ by: ["userId"], where: { user: candidate } }),
    db.notificationDelivery.groupBy({
      by: ["channel", "status"],
      _count: { _all: true },
    }),
  ]);

  const deliveries = (["TELEGRAM", "PUSH"] as const).map((channel) => {
    const of = (status: string) =>
      grouped.find((row) => row.channel === channel && row.status === status)
        ?._count._all ?? 0;
    return {
      channel,
      sent: of("SENT"),
      skipped: of("SKIPPED"),
      failed: of("FAILED"),
      pending: of("PENDING"),
    };
  });

  return { candidates, telegram, push: pushUsers.length, deliveries };
}

// ---------------------------------------------------------------------------
// Оперативные отчёты: «сейчас», места, переписка
// ---------------------------------------------------------------------------

/** «09:30» по Москве — для списков встреч. */
const mskClock = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

const HOUR = 60 * 60 * 1000;

/** Границы московского дня в UTC: полночь МСК — это 21:00 UTC накануне. */
export function mskDayRange(day: string): { from: Date; to: Date } {
  const from = new Date(`${day}T00:00:00+03:00`);
  return { from, to: new Date(from.getTime() + 24 * HOUR) };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

const userFacultyWhere = (faculty: FacultyFilter) =>
  faculty ? { faculty: faculty === NO_FACULTY ? null : faculty } : {};

const personName = (person: { lastName: string | null; firstName: string | null }) =>
  [person.lastName, person.firstName].filter(Boolean).join(" ") || "Без имени";

export interface TodayPlace {
  location: string;
  slots: number;
  booked: number;
}

export interface TodayUpcoming {
  time: string;
  candidate: string;
  location: string;
  room: string | null;
  /** Встреча уже началась или прошла. */
  started: boolean;
}

export interface TodayBoard {
  day: string;
  places: TodayPlace[];
  upcoming: TodayUpcoming[];
  assessment: { attended: number; missed: number; pending: number };
  /** Отмены записей за день: переносы и отказы. */
  reschedules: number;
  /** Переписки, где организаторы не ответили дольше 6 часов. */
  waiting: number;
}

/**
 * «Сейчас»: выбранный московский день (по умолчанию сегодня). Собирает всё,
 * что смотрят утром и в перерывах между собеседованиями: где свободные слоты,
 * кто идёт следующим, что с явкой на ЦО и кто ждёт ответа в переписке.
 */
export async function todayBoard(
  seasonId: string,
  filters: ReportFilters & { day?: string } = {},
  now = new Date(),
): Promise<TodayBoard> {
  const faculty = filters.faculty ?? "";
  const day = filters.day || mskDayKey(now);
  const { from, to } = mskDayRange(day);

  const [slots, cancelled, threads, assessment] = await Promise.all([
    db.interviewSlot.findMany({
      where: { seasonId, archivedAt: null, startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: "asc" },
      select: {
        startsAt: true,
        location: true,
        room: true,
        bookings: {
          where: { cancelledAt: null },
          select: {
            application: {
              select: { lastName: true, firstName: true, user: { select: { faculty: true } } },
            },
          },
        },
      },
    }),
    db.interviewBooking.count({
      where: {
        cancelledAt: { gte: from, lt: to },
        slot: { seasonId },
        application: { user: userFacultyWhere(faculty) },
      },
    }),
    loadThreads(seasonId, faculty, now),
    assessmentReport(seasonId, { faculty, assessmentDay: day }, now),
  ]);

  const places = new Map<string, TodayPlace>();
  const upcoming: TodayUpcoming[] = [];
  for (const slot of slots) {
    const place = places.get(slot.location) ?? { location: slot.location, slots: 0, booked: 0 };
    place.slots++;
    const active = slot.bookings.filter(
      (booking) => facultyMatches(booking.application.user.faculty, faculty),
    );
    place.booked += active.length;
    places.set(slot.location, place);
    for (const booking of active) {
      upcoming.push({
        time: mskClock(slot.startsAt),
        candidate: personName(booking.application),
        location: slot.location,
        room: slot.room,
        started: slot.startsAt.getTime() <= now.getTime(),
      });
    }
  }
  upcoming.sort((a, b) => a.time.localeCompare(b.time));

  return {
    day,
    places: [...places.values()].sort((a, b) => b.slots - a.slots),
    upcoming: upcoming.slice(0, 12),
    assessment: assessment.days[0] ?? { attended: 0, missed: 0, pending: 0 },
    reschedules: cancelled,
    waiting: threads.filter((row) => row.waitingHours >= 6).length,
  };
}

export interface BacklogRow {
  threadId: string;
  name: string;
  faculty: string | null;
  /** Сколько часов ждёт ответа, с одним знаком. */
  waitingHours: number;
  /** Кто из организаторов писал последним; null — ответа ещё не было. */
  lastByStaff: string | null;
}

interface ThreadRow extends BacklogRow {
  lastMessageAt: Date;
  lastFromCandidate: boolean;
}

/** Открытые переписки: последнее слово за кандидатом. Самая старая — в начале. */
async function loadThreads(seasonId: string, faculty: FacultyFilter, now = new Date()): Promise<ThreadRow[]> {
  const threads = await db.messageThread.findMany({
    where: { seasonId, candidate: { isOwner: false, roles: { none: {} }, ...userFacultyWhere(faculty) } },
    select: {
      id: true,
      lastMessageAt: true,
      candidate: { select: { firstName: true, lastName: true, faculty: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          author: true,
          authorRef: { select: { firstName: true, lastName: true } },
          createdAt: true,
        },
      },
    },
  });

  const rows: ThreadRow[] = [];
  for (const thread of threads) {
    const last = thread.messages[0];
    if (!last || last.author !== "CANDIDATE") continue;
    const lastStaff = thread.messages.find((message) => message.author === "STAFF" && message.authorRef);
    rows.push({
      threadId: thread.id,
      name: personName(thread.candidate),
      faculty: thread.candidate.faculty,
      waitingHours: Math.round(((now.getTime() - thread.lastMessageAt.getTime()) / HOUR) * 10) / 10,
      lastByStaff: lastStaff?.authorRef ? personName(lastStaff.authorRef) : null,
      lastMessageAt: thread.lastMessageAt,
      lastFromCandidate: true,
    });
  }
  return rows.sort((a, b) => b.waitingHours - a.waitingHours);
}

export interface BacklogReport {
  /** Всего переписок, где ждут ответа организаторы. */
  open: number;
  buckets: { label: string; count: number }[];
  rows: BacklogRow[];
}

/** Долги по переписке: кто и как давно ждёт ответа. */
export async function messageBacklog(
  seasonId: string,
  filters: ReportFilters = {},
  now = new Date(),
): Promise<BacklogReport> {
  const rows = await loadThreads(seasonId, filters.faculty ?? "", now);
  const bucket = (hours: number) => (hours < 6 ? 0 : hours < 24 ? 1 : 2);
  const buckets = ["Ждут меньше 6 часов", "От 6 до 24 часов", "Дольше суток"].map((label, index) => ({
    label,
    count: rows.filter((row) => bucket(row.waitingHours) === index).length,
  }));
  return {
    open: rows.length,
    buckets,
    rows: rows.slice(0, 100).map((row) => ({
      threadId: row.threadId,
      name: row.name,
      faculty: row.faculty,
      waitingHours: row.waitingHours,
      lastByStaff: row.lastByStaff,
    })),
  };
}

export interface SeatsRow {
  day: string;
  location: string;
  slots: number;
  booked: number;
}

export interface FreeSeatsReport {
  rows: SeatsRow[];
  /** Отправили анкету, но записи нет. */
  notBooked: number;
  /** Из них уже обязаны записаться: явка на ЦО отмечена. */
  eligibleNotBooked: number;
}

/** Свободные места на собеседования по дням и корпусам. */
export async function freeSeats(
  seasonId: string,
  filters: ReportFilters = {},
): Promise<FreeSeatsReport> {
  const faculty = filters.faculty ?? "";
  const [slots, waiting] = await Promise.all([
    db.interviewSlot.findMany({
      where: { seasonId, archivedAt: null },
      select: {
        startsAt: true,
        location: true,
        bookings: {
          where: { cancelledAt: null },
          select: { application: { select: { user: { select: { faculty: true } } } } },
        },
      },
    }),
    db.application.findMany({
      where: {
        seasonId,
        status: "SUBMITTED",
        bookings: { none: { cancelledAt: null } },
        user: userFacultyWhere(faculty),
      },
      select: { assessmentInvite: { select: { attended: true } } },
    }),
  ]);

  const rows = new Map<string, SeatsRow>();
  for (const slot of slots) {
    const key = `${mskDayKey(slot.startsAt)}|${slot.location}`;
    const row = rows.get(key) ?? { day: mskDayKey(slot.startsAt), location: slot.location, slots: 0, booked: 0 };
    row.slots++;
    row.booked += slot.bookings.filter(
      (booking) => facultyMatches(booking.application.user.faculty, faculty),
    ).length;
    rows.set(key, row);
  }

  return {
    rows: [...rows.values()].sort((a, b) => a.day.localeCompare(b.day) || a.location.localeCompare(b.location, "ru")),
    notBooked: waiting.length,
    eligibleNotBooked: waiting.filter((application) => application.assessmentInvite?.attended).length,
  };
}

// ---------------------------------------------------------------------------
// Качество оценок: согласованность мастеров, скорость, разрывы этапов
// ---------------------------------------------------------------------------

export interface AgreementReviewer {
  name: string;
  /** Средний балл по этому критерию, один знак. */
  mean: number;
  /** Сколько работ оценено по критерию. */
  n: number;
}

export interface AgreementCriterion {
  title: string;
  maxScore: number;
  /** Средний по всем мастерам — с чем сравнивать. */
  overall: number | null;
  reviewers: AgreementReviewer[];
}

export interface AgreementReport {
  APPLICATION: AgreementCriterion[];
  HOMEWORK: AgreementCriterion[];
  INTERVIEW: AgreementCriterion[];
}

/**
 * Согласованность мастеров по каждому критерию: средний балл мастера против
 * среднего по всем, кто ставил баллы за этот же критерий. Тот, кто системно
 * строже или мягче остальных, увидит себя в отклонении.
 */
export async function reviewerAgreement(seasonId: string): Promise<AgreementReport> {
  const [criteria, scores] = await Promise.all([
    db.criterion.findMany({
      where: { seasonId, stageKind: { in: ["APPLICATION", "HOMEWORK", "INTERVIEW"] } },
      select: { id: true, title: true, maxScore: true, stageKind: true },
      orderBy: { order: "asc" },
    }),
    db.reviewScore.findMany({
      where: { review: { application: { seasonId, status: "SUBMITTED" } } },
      select: {
        score: true,
        criterionId: true,
        review: {
          select: {
            stageKind: true,
            reviewer: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  const byKey = new Map<string, { stage: StageKind; criterionId: string; reviewer: string; scores: number[] }>();
  const overall = new Map<string, { stage: StageKind; scores: number[] }>();
  for (const row of scores) {
    const name = personName(row.review.reviewer);
    const reviewerKey = `${row.review.stageKind}:${row.criterionId}:${name}`;
    const reviewer = byKey.get(reviewerKey) ?? { stage: row.review.stageKind, criterionId: row.criterionId, reviewer: name, scores: [] };
    reviewer.scores.push(row.score);
    byKey.set(reviewerKey, reviewer);

    const allKey = `${row.review.stageKind}:${row.criterionId}`;
    const all = overall.get(allKey) ?? { stage: row.review.stageKind, scores: [] };
    all.scores.push(row.score);
    overall.set(allKey, all);
  }

  const result: AgreementReport = { APPLICATION: [], HOMEWORK: [], INTERVIEW: [] };
  for (const criterion of criteria) {
    const stage = criterion.stageKind as Evaluated;
    const all = overall.get(`${criterion.stageKind}:${criterion.id}`);
    const reviewers = [...byKey.values()]
      .filter((row) => row.stage === criterion.stageKind && row.criterionId === criterion.id)
      .map((row) => ({
        name: row.reviewer,
        mean: Math.round((row.scores.reduce((a, b) => a + b, 0) / row.scores.length) * 10) / 10,
        n: row.scores.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    result[stage].push({
      title: criterion.title,
      maxScore: criterion.maxScore,
      overall: all ? Math.round((all.scores.reduce((a, b) => a + b, 0) / all.scores.length) * 10) / 10 : null,
      reviewers,
    });
  }
  return result;
}

export interface SpeedStage {
  stage: Evaluated;
  /** Медиана минут от отправки анкеты до последней правки оценки этапа. */
  medianMinutes: number | null;
  samples: number;
}

export interface SpeedReport {
  stages: SpeedStage[];
  /** Медиана часов между записью и самим собеседованием. */
  bookingLeadHours: number | null;
  bookingSamples: number;
}

/** Скорость обработки: где анкеты и записи ждут дольше всего. */
export async function speed(seasonId: string): Promise<SpeedReport> {
  const stages: SpeedStage[] = [];
  for (const stage of ["APPLICATION", "HOMEWORK", "INTERVIEW"] as const) {
    const reviews = await db.review.findMany({
      where: { stageKind: stage, application: { seasonId, status: "SUBMITTED" } },
      select: { applicationId: true, updatedAt: true, application: { select: { submittedAt: true } } },
    });
    const first = new Map<string, number>();
    for (const review of reviews) {
      if (!review.application.submittedAt) continue;
      const value = first.get(review.applicationId);
      const minutes = Math.max(0, (review.updatedAt.getTime() - review.application.submittedAt.getTime()) / 60000);
      if (value === undefined || minutes < value) first.set(review.applicationId, minutes);
    }
    const values = [...first.values()];
    stages.push({ stage, medianMinutes: median(values), samples: values.length });
  }

  const bookings = await db.interviewBooking.findMany({
    where: { cancelledAt: null, slot: { seasonId, archivedAt: null } },
    select: { createdAt: true, slot: { select: { startsAt: true } } },
  });
  const leads = bookings
    .map((booking) => (booking.slot.startsAt.getTime() - booking.createdAt.getTime()) / HOUR)
    .filter((hours) => hours >= 0);

  return {
    stages,
    bookingLeadHours: median(leads),
    bookingSamples: leads.length,
  };
}

export interface GapRow {
  id: string;
  name: string;
  faculty: string | null;
  /** Доля балла этапа в процентах от максимума. */
  application: number | null;
  homework: number | null;
  assessment: number | null;
  interview: number | null;
  /** Собеседование минус анкета, в пунктах. */
  gap: number;
}

const pct = (average: number | null, max: number) => (average === null || !max ? null : Math.round((average / max) * 100));

/**
 * Наибольшие расхождения между анкетой и собеседованием у одного кандидата.
 * Перед публикацией итогов список стоит пробежать глазами: большой разрыв —
 * повод перепроверить, а не переделывать балл.
 */
export async function scoreGaps(
  seasonId: string,
  filters: { faculty?: FacultyFilter; course?: string } = {},
): Promise<{ rows: GapRow[] }> {
  const rows = await finalRows(seasonId, filters);
  const gaps = rows.flatMap((row): GapRow[] => {
    const [application, interview] = [row.parts.APPLICATION, row.parts.INTERVIEW];
    const applicationPct = pct(application?.average ?? null, application?.max ?? 0);
    const interviewPct = pct(interview?.average ?? null, interview?.max ?? 0);
    if (applicationPct === null || interviewPct === null) return [];
    return [{
      id: row.id,
      name: row.name,
      faculty: row.faculty,
      application: applicationPct,
      homework: pct(row.parts.HOMEWORK?.average ?? null, row.parts.HOMEWORK?.max ?? 0),
      assessment: pct(row.parts.ASSESSMENT?.average ?? null, row.parts.ASSESSMENT?.max ?? 0),
      interview: interviewPct,
      gap: interviewPct - applicationPct,
    }];
  });
  gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return { rows: gaps.slice(0, 15) };
}

// ---------------------------------------------------------------------------
// Итоги: баллы и разрез по факультетам
// ---------------------------------------------------------------------------

interface FinalRow {
  id: string;
  name: string;
  faculty: string | null;
  average: number | null;
  parts: Record<FinalPart, { average: number | null; max: number } | undefined>;
  accepted: boolean;
  rejected: boolean;
}

const FINAL_PARTS_LIST: FinalPart[] = ["APPLICATION", "HOMEWORK", "ASSESSMENT", "INTERVIEW"];

/** Общая выборка для итоговых отчётов: средние по этапам плюс решение. */
async function finalRows(
  seasonId: string,
  filters: { faculty?: FacultyFilter; course?: string } = {},
): Promise<FinalRow[]> {
  const [criteria, applications] = await Promise.all([
    db.criterion.findMany({
      where: { seasonId, stageKind: { in: FINAL_PARTS_LIST } },
      select: { id: true, maxScore: true, stageKind: true },
    }),
    db.application.findMany({
      where: {
        seasonId,
        status: "SUBMITTED",
        user: userSliceWhere(filters),
      },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        user: { select: { faculty: true } },
        reviews: {
          where: { stageKind: { in: FINAL_PARTS_LIST } },
          select: { stageKind: true, scores: { select: { criterionId: true, score: true } } },
        },
        decisions: {
          where: { stageKind: "INTERVIEW" },
          select: { outcome: true, publishedAt: true },
        },
      },
    }),
  ]);

  const maxOf = (stage: FinalPart) =>
    criteria.filter((criterion) => criterion.stageKind === stage).reduce((sum, criterion) => sum + criterion.maxScore, 0);
  const criteriaOf = (stage: FinalPart) => criteria.filter((criterion) => criterion.stageKind === stage);

  return applications.map((application): FinalRow => {
    const parts = {} as FinalRow["parts"];
    for (const stage of FINAL_PARTS_LIST) {
      if (maxOf(stage) === 0) continue;
      const totals = application.reviews
        .filter((review) => review.stageKind === stage)
        .map((review) => reviewSummary(criteriaOf(stage), review.scores).total)
        .filter((total): total is number => total !== null);
      parts[stage] = {
        average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null,
        max: maxOf(stage),
      };
    }
    const scored = Object.values(parts).filter((part): part is { average: number; max: number } => part?.average != null);
    const decision = application.decisions[0];
    return {
      id: application.id,
      name: personName(application),
      faculty: application.user.faculty,
      average: scored.length ? Math.round(scored.reduce((sum, part) => sum + part.average, 0) * 10) / 10 : null,
      parts,
      accepted: decision?.outcome === "PASSED" && decision.publishedAt != null,
      rejected: decision?.outcome === "REJECTED" && decision.publishedAt != null,
    };
  });
}

export interface FinalScoresReport {
  count: number;
  mean: number | null;
  maxTotal: number;
  /** Индекс — целая часть итога. */
  histogram: number[];
  stageMeans: { stage: FinalPart; mean: number | null; max: number }[];
  accepted: number;
  rejected: number;
}

/** Распределение итоговых баллов и средние по этапам. */
export async function finalScores(
  seasonId: string,
  filters: { faculty?: FacultyFilter; course?: string } = {},
): Promise<FinalScoresReport> {
  const rows = await finalRows(seasonId, filters);
  const totals = new Map<FinalPart, number>();
  for (const stage of FINAL_PARTS_LIST) {
    const max = Math.max(0, ...rows.map((row) => row.parts[stage]?.max ?? 0));
    totals.set(stage, max);
  }
  const realMaxTotal = [...totals.values()].reduce((a, b) => a + b, 0);

  const histogram = Array.from({ length: realMaxTotal + 1 }, () => 0);
  const scored = rows.filter((row) => row.average !== null) as (FinalRow & { average: number })[];
  for (const row of scored) {
    const index = Math.min(Math.floor(row.average), realMaxTotal);
    histogram[index] = (histogram[index] ?? 0) + 1;
  }

  return {
    count: scored.length,
    mean: scored.length ? Math.round((scored.reduce((sum, row) => sum + row.average, 0) / scored.length) * 10) / 10 : null,
    maxTotal: realMaxTotal,
    histogram,
    stageMeans: FINAL_PARTS_LIST.map((stage) => {
      const values = rows.map((row) => row.parts[stage]?.average).filter((value): value is number => value != null);
      return { stage, mean: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null, max: totals.get(stage) ?? 0 };
    }).filter((part) => part.max > 0),
    accepted: rows.filter((row) => row.accepted).length,
    rejected: rows.filter((row) => row.rejected).length,
  };
}

export interface FacultyOutcomeRow {
  faculty: string | null;
  submitted: number;
  accepted: number;
  rejected: number;
  /** Ещё нет опубликованного решения. */
  pending: number;
  meanFinal: number | null;
}

/** Итоги по факультетам: кто сколько прошёл и со каким баллом. */
export async function facultyOutcomes(
  seasonId: string,
  filters: { course?: string } = {},
): Promise<FacultyOutcomeRow[]> {
  const rows = await finalRows(seasonId, filters);
  const map = new Map<string, FacultyOutcomeRow & { finals: number[] }>();
  for (const row of rows) {
    const key = row.faculty ?? NO_FACULTY;
    const item = map.get(key) ?? { faculty: row.faculty, submitted: 0, accepted: 0, rejected: 0, pending: 0, meanFinal: null, finals: [] };
    item.submitted++;
    if (row.accepted) item.accepted++;
    else if (row.rejected) item.rejected++;
    else item.pending++;
    if (row.average !== null) item.finals.push(row.average);
    map.set(key, item);
  }
  return [...map.values()]
    .map(({ finals, ...row }) => ({
      ...row,
      meanFinal: finals.length ? Math.round((finals.reduce((a, b) => a + b, 0) / finals.length) * 10) / 10 : null,
    }))
    .sort((a, b) => b.submitted - a.submitted || (a.faculty ?? "").localeCompare(b.faculty ?? "", "ru"));
}

export interface NotBookedRow {
  id: string;
  name: string;
  faculty: string | null;
  /** Сколько целых дней осталось до последнего дня собеседований. */
  daysLeft?: number | null;
}

export interface NotBookedFacultyRow {
  faculty: string | null;
  assessment: number;
  interview: number;
}

export interface NotBookedReport {
  /** Отправили анкету, но не ответили на приглашение на ЦО. */
  assessment: { count: number; rows: NotBookedRow[] };
  /** Явка на ЦО отмечена, записи на собеседование нет. */
  interview: { count: number; rows: NotBookedRow[] };
  /** Те же цифры по факультетам — для графика. */
  byFaculty: NotBookedFacultyRow[];
}

/**
 * Кто застрял между этапами. Совпадает с сегментами рассылок no_assessment
 * и not_booked, поэтому кнопка «Напомнить» ведёт на готовую рассылку.
 */
export async function notBooked(
  seasonId: string,
  filters: ReportFilters = {},
  now = new Date(),
): Promise<NotBookedReport> {
  const userWhere = userFacultyWhere(filters.faculty ?? "");
  const [assessmentRows, interviewRows, lastSlot] = await Promise.all([
    db.application.findMany({
      where: {
        seasonId,
        status: "SUBMITTED",
        user: { status: "ACTIVE", ...userWhere },
        OR: [{ assessmentInvite: null }, { assessmentInvite: { is: { answer: null } } }],
      },
      select: { id: true, lastName: true, firstName: true, user: { select: { faculty: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    db.application.findMany({
      where: {
        seasonId,
        status: "SUBMITTED",
        bookings: { none: { cancelledAt: null } },
        assessmentInvite: { is: { attended: true } },
        user: { status: "ACTIVE", ...userWhere },
      },
      select: { id: true, lastName: true, firstName: true, user: { select: { faculty: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    db.interviewSlot.findFirst({
      where: { seasonId, archivedAt: null },
      orderBy: { startsAt: "desc" },
      select: { startsAt: true },
    }),
  ]);

  const lastDay = lastSlot ? mskDayKey(lastSlot.startsAt) : null;
  const todayKey = mskDayKey(now);
  const daysLeft = lastDay
    ? Math.max(0, Math.round((new Date(`${lastDay}T00:00:00+03:00`).getTime() - new Date(`${todayKey}T00:00:00+03:00`).getTime()) / (24 * HOUR)))
    : null;
  const toRow = (application: (typeof assessmentRows)[number]): NotBookedRow => ({
    id: application.id,
    name: personName(application),
    faculty: application.user.faculty,
  });

  const tally = new Map<string, NotBookedFacultyRow>();
  for (const application of assessmentRows) {
    const key = application.user.faculty ?? NO_FACULTY;
    const row = tally.get(key) ?? { faculty: application.user.faculty, assessment: 0, interview: 0 };
    row.assessment++;
    tally.set(key, row);
  }
  for (const application of interviewRows) {
    const key = application.user.faculty ?? NO_FACULTY;
    const row = tally.get(key) ?? { faculty: application.user.faculty, assessment: 0, interview: 0 };
    row.interview++;
    tally.set(key, row);
  }

  return {
    assessment: { count: assessmentRows.length, rows: assessmentRows.slice(0, 50).map(toRow) },
    interview: { count: interviewRows.length, rows: interviewRows.slice(0, 50).map((row) => ({ ...toRow(row), daysLeft })) },
    byFaculty: [...tally.values()].sort((a, b) => b.assessment + b.interview - (a.assessment + a.interview)),
  };
}

// ---------------------------------------------------------------------------
// Каналы и вовлечённость
// ---------------------------------------------------------------------------

export interface DeliveriesDay {
  day: string;
  sent: number;
  failed: number;
  skipped: number;
}

export interface DeliveriesCategory {
  category: string;
  created: number;
  sent: number;
  failed: number;
}

export interface DeliveriesReport {
  days: DeliveriesDay[];
  categories: DeliveriesCategory[];
}

/** Уведомления по дням: сколько ушло, сколько не дошло, по каким темам. */
export async function deliveries(seasonId: string, days = 14, now = new Date()): Promise<DeliveriesReport> {
  const from = new Date(now.getTime() - days * 24 * HOUR);
  const [rows, categories] = await Promise.all([
    db.$queryRaw<{ day: string; status: string; n: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day, status, count(*) AS n
      FROM notification_deliveries
      WHERE "createdAt" >= ${from}
      GROUP BY 1, 2`,
    db.$queryRaw<{ category: string; created: bigint; sent: bigint; failed: bigint }[]>`
      SELECT n.category,
             count(DISTINCT n.id) AS created,
             count(DISTINCT CASE WHEN d.status = 'SENT' THEN n.id END) AS sent,
             count(DISTINCT CASE WHEN d.status = 'FAILED' THEN n.id END) AS failed
      FROM notifications n
      LEFT JOIN notification_deliveries d ON d."notificationId" = n.id
      WHERE n."createdAt" >= ${from}
      GROUP BY 1`,
  ]);

  const byDay = new Map<string, DeliveriesDay>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(
      new Date(now.getTime() - i * 24 * HOUR),
    );
    byDay.set(day, { day, sent: 0, failed: 0, skipped: 0 });
  }
  for (const row of rows) {
    const point = byDay.get(row.day);
    if (!point) continue;
    if (row.status === "SENT") point.sent += Number(row.n);
    else if (row.status === "FAILED") point.failed += Number(row.n);
    else if (row.status === "SKIPPED") point.skipped += Number(row.n);
  }
  void seasonId;

  return {
    days: [...byDay.values()],
    categories: categories.map((row) => ({
      category: row.category,
      created: Number(row.created),
      sent: Number(row.sent),
      failed: Number(row.failed),
    })),
  };
}

export interface EngagementReport {
  games: { players: number; plays: number; players7: number; plays7: number };
  quiz: { takers: number; meanPercent: number | null };
  daily: { solvers: number; solvers7: number };
  byStage: { key: string; label: string; total: number; players: number }[];
}

/** Вовлечённость: кто играет, проходит тест и решает задание дня по этапам отбора. */
export async function engagement(seasonId: string, now = new Date()): Promise<EngagementReport> {
  const candidate = { isOwner: false, roles: { none: {} } };
  const weekAgo = new Date(now.getTime() - 7 * 24 * HOUR);
  const [players, plays, players7, plays7, quiz, daily7, gameUsers, submitted, booked, accepted] =
    await Promise.all([
      db.user.count({ where: { ...candidate, gameResults: { some: {} } } }),
      db.gameResult.count({ where: { user: candidate } }),
      db.user.count({ where: { ...candidate, gameResults: { some: { createdAt: { gte: weekAgo } } } } }),
      db.gameResult.count({ where: { user: candidate, createdAt: { gte: weekAgo } } }),
      db.quizAttempt.findMany({ where: { seasonId }, select: { score: true, total: true } }),
      db.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT "userId") AS n FROM daily_solutions
        WHERE date >= ${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(now.getTime() - 6 * 24 * HOUR))}`,
      db.gameResult.findMany({ select: { userId: true }, distinct: ["userId"] }),
      db.application.findMany({ where: { seasonId, status: "SUBMITTED" }, select: { userId: true } }),
      db.application.findMany({ where: { seasonId, bookings: { some: { cancelledAt: null } } }, select: { userId: true } }),
      db.application.findMany({
        where: {
          seasonId,
          decisions: { some: { stageKind: "INTERVIEW", outcome: "PASSED", publishedAt: { not: null } } },
        },
        select: { userId: true },
      }),
    ]);

  const dailySolvers = await db.dailySolution.groupBy({ by: ["userId"] });
  const playerSet = new Set(gameUsers.map((row) => row.userId));
  const share = (userIds: string[]) => ({
    total: userIds.length,
    players: userIds.filter((userId) => playerSet.has(userId)).length,
  });

  return {
    games: { players, plays, players7, plays7 },
    quiz: {
      takers: quiz.length,
      meanPercent: quiz.length
        ? Math.round((quiz.reduce((sum, attempt) => sum + (attempt.total ? attempt.score / attempt.total : 0), 0) / quiz.length) * 100)
        : null,
    },
    daily: { solvers: dailySolvers.length, solvers7: Number(daily7[0]?.n ?? 0) },
    byStage: [
      { key: "submitted", label: "Отправили анкету", ...share(submitted.map((row) => row.userId)) },
      { key: "booked", label: "Записались на собес", ...share(booked.map((row) => row.userId)) },
      { key: "accepted", label: "Прошли отбор", ...share(accepted.map((row) => row.userId)) },
    ],
  };
}

/** Всё, что отдаёт /api/staff/dashboards, одним типом — для useFetch на странице. */
export interface DashboardPayload {
  funnel: FunnelStep[];
  daily: DailyPoint[];
  stages: { APPLICATION: StageStats; HOMEWORK: StageStats; INTERVIEW: StageStats };
  breakdowns: Breakdown[];
  channels: ChannelStats;
  games: { players: number; plays: number };
  assessment: AssessmentReport;
  interviews: InterviewReport;
  today: TodayBoard;
  seats: FreeSeatsReport;
  backlog: BacklogReport;
  agreement: AgreementReport;
  speed: SpeedReport;
  gaps: GapRow[];
  final: FinalScoresReport;
  faculties: FacultyOutcomeRow[];
  waiting: NotBookedReport;
  deliveries: DeliveriesReport;
  activity: EngagementReport;
  sourceOptions: string[];
  milestones: MilestonesReport;
  masters: { id: string; name: string }[];
  masterDays: MasterInterviewDay[];
}

// ---------------------------------------------------------------------------
// Прохождение по дням, радуга факультетов, корпуса, мастера
// ---------------------------------------------------------------------------

export interface MilestoneDay {
  day: string;
  submitted: number;
  assessment: number;
  interviews: number;
  accepted: number;
}

export interface MilestonesReport {
  days: MilestoneDay[];
  totals: Omit<MilestoneDay, "day">;
  buildings: { building: string; assessment: number; interviews: number }[];
  faculties: { faculty: string | null; submitted: number; assessment: number; interviews: number; accepted: number }[];
}

/**
 * Кто когда проходил: четыре события по московским дням. Дни считаются от
 * самого события: отправка — по submittedAt, явка на ЦО — по дню сбора
 * (включая резервный), собеседование — по дню слота, принятие — по дню
 * публикации решения.
 */
export async function milestonesByDay(
  seasonId: string,
  filters: { faculty?: FacultyFilter; course?: string; building?: string } = {},
  from = new Date(Date.now() - 30 * 24 * HOUR),
  to = new Date(),
): Promise<MilestonesReport> {
  const [reserve, applications] = await Promise.all([
    db.assessmentSession.findFirst({
      where: { seasonId, reserve: true },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: { startsAt: true, building: true, invited: true },
    }),
    db.application.findMany({
      where: {
        seasonId,
        status: "SUBMITTED",
        user: userSliceWhere(filters),
      },
      select: {
        submittedAt: true,
        user: { select: { faculty: true } },
        assessmentInvite: {
          select: {
            attended: true,
            answer: true,
            reserveQueued: true,
            session: { select: { startsAt: true, building: true, invited: true } },
          },
        },
        bookings: {
          where: { cancelledAt: null },
          select: { slot: { select: { startsAt: true, archivedAt: true, location: true } } },
        },
        decisions: {
          where: { stageKind: "INTERVIEW", outcome: "PASSED", publishedAt: { not: null } },
          select: { publishedAt: true },
        },
      },
    }),
  ]);

  const reserveStartsAt = reserve ? slotStartsAt(reserve) : null;
  const dayOf = (date: Date) => {
    const key = mskDayKey(date);
    return key >= mskDayKey(from) && key <= mskDayKey(to) ? key : null;
  };
  const matches = (faculty: string | null | undefined) => facultyMatches(faculty, filters.faculty ?? "");
  const buildingOk = (building: string | null | undefined) => !filters.building || building === filters.building;

  const map = new Map<string, MilestoneDay>();
  const touch = (key: string) => {
    let row = map.get(key);
    if (!row) {
      row = { day: key, submitted: 0, assessment: 0, interviews: 0, accepted: 0 };
      map.set(key, row);
    }
    return row;
  };

  const totals = { submitted: 0, assessment: 0, interviews: 0, accepted: 0 };
  const buildings = new Map<string, { building: string; assessment: number; interviews: number }>();
  const faculties = new Map<string, { faculty: string | null; submitted: number; assessment: number; interviews: number; accepted: number }>();
  const facultyRow = (faculty: string | null) => {
    const key = faculty ?? NO_FACULTY;
    const row = faculties.get(key) ?? { faculty, submitted: 0, assessment: 0, interviews: 0, accepted: 0 };
    faculties.set(key, row);
    return row;
  };

  for (const application of applications) {
    if (!matches(application.user.faculty)) continue;
    const row = facultyRow(application.user.faculty);

    if (application.submittedAt) {
      const key = dayOf(application.submittedAt);
      if (key) touch(key).submitted++;
      totals.submitted++;
      row.submitted++;
    }

    const invite = application.assessmentInvite;
    if (invite?.attended) {
      const day = attendanceDay(
        {
          sessionStartsAt: slotStartsAt(invite.session),
          answer: invite.answer,
          reserveQueued: invite.reserveQueued,
          attended: invite.attended,
        },
        reserveStartsAt,
      );
      if (day && buildingOk(invite.session.building)) {
        const key = dayOf(day);
        if (key) touch(key).assessment++;
        totals.assessment++;
        row.assessment++;
        const buildingKey = invite.session.building || "Без корпуса";
        const building = buildings.get(buildingKey) ?? { building: buildingKey, assessment: 0, interviews: 0 };
        building.assessment++;
        buildings.set(buildingKey, building);
      }
    }

    for (const booking of application.bookings) {
      if (booking.slot.archivedAt || !buildingOk(booking.slot.location)) continue;
      const key = dayOf(booking.slot.startsAt);
      if (key) touch(key).interviews++;
      totals.interviews++;
      row.interviews++;
      const buildingKey = booking.slot.location || "Без корпуса";
      const building = buildings.get(buildingKey) ?? { building: buildingKey, assessment: 0, interviews: 0 };
      building.interviews++;
      buildings.set(buildingKey, building);
    }

    for (const decision of application.decisions) {
      if (!decision.publishedAt) continue;
      const key = dayOf(decision.publishedAt);
      if (key) touch(key).accepted++;
      totals.accepted++;
      row.accepted++;
    }
  }

  const days = [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  return {
    days,
    totals,
    buildings: [...buildings.values()].sort((a, b) => b.assessment + b.interviews - (a.assessment + a.interviews)),
    faculties: [...faculties.values()].sort((a, b) => b.submitted - a.submitted || (a.faculty ?? "").localeCompare(b.faculty ?? "", "ru")),
  };
}

export interface MasterInterviewDay {
  day: string;
  slots: number;
  booked: number;
}

/** Собеседования мастера по дням: его слоты и записи на них. */
export async function masterInterviewsByDay(
  seasonId: string,
  masterId: string,
  from = new Date(Date.now() - 30 * 24 * HOUR),
  to = new Date(),
): Promise<MasterInterviewDay[]> {
  const slots = await db.interviewSlot.findMany({
    where: {
      seasonId,
      archivedAt: null,
      startsAt: { gte: from, lte: to },
      interviewers: { some: { userId: masterId } },
    },
    select: { startsAt: true, bookings: { where: { cancelledAt: null }, select: { id: true } } },
  });
  const map = new Map<string, MasterInterviewDay>();
  for (const slot of slots) {
    const key = mskDayKey(slot.startsAt);
    const row = map.get(key) ?? { day: key, slots: 0, booked: 0 };
    row.slots++;
    row.booked += slot.bookings.length;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Мастера сезона: все, кто ставил оценки или вёл собеседования. */
export async function staffMasters(seasonId: string): Promise<{ id: string; name: string }[]> {
  const [reviewers, interviewers] = await Promise.all([
    db.review.findMany({
      where: { application: { seasonId } },
      select: { reviewer: { select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true } } },
      distinct: ["reviewerId"],
    }),
    db.slotInterviewer.findMany({
      where: { slot: { seasonId } },
      select: { user: { select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true } } },
      distinct: ["userId"],
    }),
  ]);
  const map = new Map<string, string>();
  for (const person of [...reviewers.map((row) => row.reviewer), ...interviewers.map((row) => row.user)]) {
    map.set(person.id, displayName(person));
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
