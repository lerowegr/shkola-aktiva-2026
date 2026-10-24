import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import type { StageKind } from "~~/lib/generated/prisma/enums";
import type { GuideView } from "~~/lib/interviews/guide";
import { facultyMatches, NO_FACULTY, type FacultyFilter } from "~~/lib/profile/faculty";

import type { AnswerValue } from "./form";
import { reviewSummary, type ReviewSummary } from "./review";

/**
 * Анкеты глазами организатора: списки «Мои / Все» и карточка с оценками —
 * для любого оцениваемого этапа: анкеты, домашнего задания, собеседования.
 *
 * Здесь только чтение и сборка. Кто что вправе видеть, решает обработчик:
 * сюда приходит уже проверенный вопрос.
 */

/** Этапы, на которых мастера ставят баллы. */
export type EvaluatedStage = Extract<StageKind, "APPLICATION" | "HOMEWORK" | "INTERVIEW">;
export const EVALUATED_STAGES: EvaluatedStage[] = ["APPLICATION", "HOMEWORK", "INTERVIEW"];

/**
 * Кто вообще попадает в списки этапа. Анкета — отправленная. Домашка —
 * те, кто сдал работу (сдать может только прошедший анкету).
 * Собеседование — те, у кого есть оценка собеседования (появляется при
 * записи на слот).
 */
function stageFilter(stage: EvaluatedStage) {
  if (stage === "HOMEWORK") {
    return { status: "SUBMITTED" as const, submissions: { some: { stageKind: "HOMEWORK" as const, replacedAt: null } } };
  }
  if (stage === "INTERVIEW") {
    return { status: "SUBMITTED" as const, reviews: { some: { stageKind: "INTERVIEW" as const } } };
  }
  return { status: "SUBMITTED" as const };
}

export function fullName(person: {
  lastName: string | null;
  firstName: string | null;
  middleName?: string | null;
}): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(" ") || "Без имени";
}

export function initials(person: { lastName: string | null; firstName: string | null }): string {
  return ((person.lastName?.[0] ?? "") + (person.firstName?.[0] ?? "")).toUpperCase() || "?";
}

export async function criteriaFor(seasonId: string, stage: StageKind) {
  return db.criterion.findMany({
    where: { seasonId, stageKind: stage },
    orderBy: { order: "asc" },
    select: { id: true, title: true, badge: true, description: true, indicators: true, examples: true, maxScore: true, levels: true },
  });
}

// ---------------------------------------------------------------------------
// Списки
// ---------------------------------------------------------------------------

export type ListScope = "mine" | "all";
export type ListFilter = "all" | "todo" | "done";

export interface ListRow {
  id: string;
  name: string;
  initials: string;
  telegramUsername: string | null;
  /** Факультет из знакомства — для фильтра и подписи в списке. */
  faculty: string | null;
  submittedAt: Date | null;
  reviewers: { id: string; name: string; isMe: boolean; released: boolean }[];
  mine: boolean;
  summary: ReviewSummary;
  /** Маркеры, по которым мастер что-то написал, — чипы в списке. */
  markers: string[];
}

export interface ListResult {
  rows: ListRow[];
  /** Счётчики вкладок — с учётом выбранного факультета. */
  counts: Record<ListFilter, number>;
  unassigned: number;
  /** Сколько анкет на каждом факультете (NO_FACULTY — не указан), без учёта фильтра. */
  faculties: Record<string, number>;
}

function matches(row: ListRow, studentId: string | null, query: string): boolean {
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return true;
  return [row.name, studentId ?? "", row.telegramUsername ?? ""].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

export async function listApplications(params: {
  seasonId: string;
  viewerId: string;
  scope: ListScope;
  filter: ListFilter;
  query: string;
  stage?: EvaluatedStage;
  faculty?: FacultyFilter;
}): Promise<ListResult> {
  const { seasonId, viewerId, scope, filter, query } = params;
  const faculty = params.faculty ?? "";
  const stage = params.stage ?? "APPLICATION";

  const [criteria, applications] = await Promise.all([
    criteriaFor(seasonId, stage),
    db.application.findMany({
      where: {
        seasonId,
        AND: [
          stageFilter(stage),
          scope === "mine" ? { reviews: { some: { stageKind: stage, reviewerId: viewerId, releasedAt: null } } } : {},
        ],
      },
      orderBy: { submittedAt: "asc" },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        studentId: true,
        submittedAt: true,
        user: { select: { telegramUsername: true, faculty: true } },
        submissions: {
          where: { stageKind: stage, replacedAt: null },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: { submittedAt: true },
        },
        reviews: {
          where: { stageKind: stage },
          orderBy: { assignedAt: "asc" },
          select: {
            reviewerId: true,
            releasedAt: true,
            reviewer: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } },
            scores: { select: { criterionId: true, score: true } },
            markers: { where: { note: { not: "" } }, select: { marker: { select: { title: true, order: true } } } },
          },
        },
      },
    }),
  ]);

  const all: (ListRow & { studentId: string | null })[] = applications.map((application) => {
    // В «Моих» показываем свою оценку, во «Всех» — оценку первого мастера.
    const main =
      application.reviews.find((review) => review.reviewerId === viewerId) ?? application.reviews[0] ?? null;

    return {
      id: application.id,
      name: fullName(application),
      initials: initials(application),
      telegramUsername: application.user.telegramUsername,
      faculty: application.user.faculty,
      studentId: application.studentId,
      // Для домашки «когда сдал» — дата работы, а не анкеты.
      submittedAt: application.submissions[0]?.submittedAt ?? application.submittedAt,
      reviewers: application.reviews.map((review) => ({
        id: review.reviewerId,
        name: displayName(review.reviewer),
        isMe: review.reviewerId === viewerId,
        released: review.releasedAt !== null,
      })),
      mine: application.reviews.some((review) => review.reviewerId === viewerId && review.releasedAt === null),
      summary: reviewSummary(criteria, main?.scores ?? []),
      markers: (main?.markers ?? [])
        .map((item) => item.marker)
        .sort((a, b) => a.order - b.order)
        .map((marker) => marker.title),
    };
  });

  const faculties: Record<string, number> = {};
  for (const row of all) {
    const key = row.faculty || NO_FACULTY;
    faculties[key] = (faculties[key] ?? 0) + 1;
  }
  const inFaculty = all.filter((row) => facultyMatches(row.faculty, faculty));

  const counts = {
    all: inFaculty.length,
    todo: inFaculty.filter((row) => row.summary.status !== "done").length,
    done: inFaculty.filter((row) => row.summary.status === "done").length,
  };

  const rows = inFaculty
    .filter((row) => filter === "all" || (filter === "done") === (row.summary.status === "done"))
    .filter((row) => matches(row, row.studentId, query))
    .map(({ studentId: _studentId, ...row }) => row);

  return { rows, counts, unassigned: all.filter((row) => row.reviewers.length === 0).length, faculties };
}

// ---------------------------------------------------------------------------
// Карточка анкеты
// ---------------------------------------------------------------------------

export interface StaffReview {
  id: string;
  reviewer: { id: string; name: string };
  isMine: boolean;
  /** Возвращена на биржу с сохранением: заморожена, только чтение. */
  released: boolean;
  scores: Record<string, number>;
  markers: Record<string, string>;
  comment: string;
  summary: ReviewSummary;
  updatedAt: Date;
  /** Кто последним менял оценку: сам мастер или, например, переназначивший. */
  updatedBy: string | null;
  touched: boolean;
}

export interface StaffSubmission {
  id: string;
  submittedAt: Date;
  text: string | null;
  via: "SITE" | "TELEGRAM";
  file: { id: string; filename: string; size: number } | null;
  current: boolean;
}

export interface StaffInterview {
  startsAt: Date;
  endsAt: Date;
  location: string;
  interviewers: string[];
}

export interface StaffCriterion {
  id: string;
  title: string;
  badge: string | null;
  description: string | null;
  /** Общий список индикаторов — показываем один раз над баллами. */
  indicators: string | null;
  /** Примерные вопросы или примерное наполнение — под спойлером. */
  examples: string | null;
  maxScore: number;
  levels: { score: number; text: string }[];
}

export interface StaffApplication {
  stage: EvaluatedStage;
  /** Запись на собеседование — для этапа собеседования. */
  interview: StaffInterview | null;
  /** Текст задания этапа — для домашки. */
  task: string | null;
  /** Сдачи работы, свежая первой. Для анкеты пусто. */
  submissions: StaffSubmission[];
  id: string;
  name: string;
  initials: string;
  telegramUsername: string | null;
  submittedAt: Date | null;
  profile: { lastName: string | null; firstName: string | null; middleName: string | null; studentId: string | null };
  questions: { id: string; section: string; label: string; answer: AnswerValue | null }[];
  criteria: StaffCriterion[];
  markers: { id: string; title: string; example: string | null }[];
  reviews: StaffReview[];
}

export async function loadStaffApplication(
  applicationId: string,
  viewerId: string,
  stage: EvaluatedStage = "APPLICATION",
): Promise<StaffApplication | null> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      seasonId: true,
      status: true,
      lastName: true,
      firstName: true,
      middleName: true,
      studentId: true,
      submittedAt: true,
      user: { select: { telegramUsername: true } },
      answers: { select: { questionId: true, value: true } },
      bookings: {
        where: { cancelledAt: null },
        take: 1,
        select: {
          slot: {
            select: {
              startsAt: true,
              endsAt: true,
              location: true,
              interviewers: {
                select: { user: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } },
              },
            },
          },
        },
      },
      // На собеседовании мастеру нужна домашка: о ней часто и говорят.
      submissions: {
        where: { stageKind: stage === "APPLICATION" ? "APPLICATION" : "HOMEWORK" },
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          submittedAt: true,
          text: true,
          via: true,
          replacedAt: true,
          upload: { select: { id: true, filename: true, size: true } },
        },
      },
      reviews: {
        where: { stageKind: stage },
        orderBy: { assignedAt: "asc" },
        select: {
          id: true,
          reviewerId: true,
          releasedAt: true,
          reviewer: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } },
          comment: true,
          updatedAt: true,
          updatedById: true,
          scores: { select: { criterionId: true, score: true } },
          markers: { select: { markerId: true, note: true } },
        },
      },
    },
  });

  // Черновики организаторам не показываем: человек ещё пишет.
  if (!application || application.status !== "SUBMITTED") return null;

  const [questions, criteria, stageRow, markers] = await Promise.all([
    // Ответы анкеты показываем на любом этапе: мастеру ДЗ полезно помнить,
    // кто перед ним.
    db.formQuestion.findMany({
      where: { seasonId: application.seasonId, stageKind: "APPLICATION" },
      orderBy: { order: "asc" },
      select: { id: true, section: true, label: true },
    }),
    criteriaFor(application.seasonId, stage),
    db.stage.findUnique({
      // Текст задания — от этапа ДЗ: на собеседовании его тоже показываем.
      where: { seasonId_kind: { seasonId: application.seasonId, kind: stage === "APPLICATION" ? "APPLICATION" : "HOMEWORK" } },
      select: { description: true },
    }),
    db.marker.findMany({
      where: { seasonId: application.seasonId, stageKind: stage },
      orderBy: { order: "asc" },
      select: { id: true, title: true, example: true },
    }),
  ]);

  const editors = new Set(application.reviews.map((review) => review.updatedById).filter(Boolean) as string[]);
  const people = await db.user.findMany({
    where: { id: { in: [...editors] } },
    select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true },
  });
  const nameOf = new Map(people.map((person) => [person.id, displayName(person)]));

  const answers = new Map(application.answers.map((answer) => [answer.questionId, answer.value as AnswerValue]));

  const booking = application.bookings[0]?.slot ?? null;

  return {
    stage,
    interview:
      stage === "INTERVIEW" && booking
        ? {
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            location: booking.location,
            interviewers: booking.interviewers.map((item) => displayName(item.user)),
          }
        : null,
    task: stageRow?.description ?? null,
    submissions: application.submissions.map((submission) => ({
      id: submission.id,
      submittedAt: submission.submittedAt,
      text: submission.text,
      via: submission.via,
      file: submission.upload,
      current: submission.replacedAt === null,
    })),
    id: application.id,
    name: fullName(application),
    initials: initials(application),
    telegramUsername: application.user.telegramUsername,
    submittedAt: application.submittedAt,
    profile: {
      lastName: application.lastName,
      firstName: application.firstName,
      middleName: application.middleName,
      studentId: application.studentId,
    },
    questions: questions.map((question) => ({ ...question, answer: answers.get(question.id) ?? null })),
    criteria: criteria.map((criterion) => ({
      ...criterion,
      levels: criterion.levels as { score: number; text: string }[],
    })),
    markers,
    reviews: application.reviews.map((review) => ({
      id: review.id,
      reviewer: { id: review.reviewerId, name: displayName(review.reviewer) },
      isMine: review.reviewerId === viewerId,
      released: review.releasedAt !== null,
      scores: Object.fromEntries(review.scores.map((score) => [score.criterionId, score.score])),
      markers: Object.fromEntries(review.markers.map((marker) => [marker.markerId, marker.note])),
      comment: review.comment ?? "",
      summary: reviewSummary(criteria, review.scores),
      updatedAt: review.updatedAt,
      updatedBy: review.updatedById ? (nameOf.get(review.updatedById) ?? null) : null,
      touched: review.updatedById !== null,
    })),
  };
}

/** Ответ обработчика карточки — тип для страницы. */
export interface StaffApplicationResponse {
  card: StaffApplication;
  stage: EvaluatedStage;
  canEdit: boolean;
  canAssign: boolean;
  scope: ListScope;
  /** Сценарий собеса с колонками мастеров — только на этапе INTERVIEW. */
  guide: GuideView | null;
  prev: string | null;
  next: string | null;
}

/** Соседи в списке — для кнопок «Предыдущая» и «Следующая». */
export async function neighbours(
  seasonId: string,
  viewerId: string,
  applicationId: string,
  scope: ListScope,
  stage: EvaluatedStage = "APPLICATION",
): Promise<{ prev: string | null; next: string | null }> {
  const { rows } = await listApplications({ seasonId, viewerId, scope, filter: "all", query: "", stage });
  const index = rows.findIndex((row) => row.id === applicationId);
  if (index === -1) return { prev: null, next: null };
  return { prev: rows[index - 1]?.id ?? null, next: rows[index + 1]?.id ?? null };
}
