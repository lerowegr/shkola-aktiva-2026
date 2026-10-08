import { reviewSummary } from "~~/lib/applications/review";
import { criteriaFor, fullName, type StaffCriterion, type StaffReview } from "~~/lib/applications/staff";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";

/**
 * Экран группы центра оценки: все кандидаты группы с оценками экспертов.
 * Эксперт видит здесь свои оценки для правки и чужие — для чтения.
 */
export interface AssessmentSheet {
  id: string;
  title: string;
  building: string | null;
  room: string | null;
  startsAt: Date | null;
  note: string | null;
  experts: { id: string; name: string }[];
  criteria: StaffCriterion[];
  markers: { id: string; title: string; example: string | null }[];
  members: { applicationId: string; name: string; reviews: StaffReview[] }[];
}

export async function loadSheet(seasonId: string, groupId: string, viewerId: string): Promise<AssessmentSheet | null> {
  const group = await db.assessmentGroup.findFirst({
    where: { id: groupId, seasonId },
    select: {
      id: true,
      title: true,
      building: true,
      room: true,
      startsAt: true,
      note: true,
      experts: { select: { user: { select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true } } } },
      members: {
        orderBy: [{ application: { lastName: "asc" } }, { application: { firstName: "asc" } }],
        select: {
          application: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              reviews: {
                where: { stageKind: "ASSESSMENT" },
                orderBy: { assignedAt: "asc" },
                select: {
                  id: true,
                  reviewerId: true,
                  reviewer: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } },
                  comment: true,
                  updatedAt: true,
                  updatedById: true,
                  scores: { select: { criterionId: true, score: true } },
                  markers: { select: { markerId: true, note: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!group) return null;

  const [criteria, markers] = await Promise.all([
    criteriaFor(seasonId, "ASSESSMENT"),
    db.marker.findMany({
      where: { seasonId, stageKind: "ASSESSMENT" },
      orderBy: { order: "asc" },
      select: { id: true, title: true, example: true },
    }),
  ]);

  const editors = new Set(
    group.members.flatMap((member) => member.application.reviews.map((review) => review.updatedById)).filter(Boolean) as string[],
  );
  const people = await db.user.findMany({
    where: { id: { in: [...editors] } },
    select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true },
  });
  const nameOf = new Map(people.map((person) => [person.id, displayName(person)]));

  return {
    id: group.id,
    title: group.title,
    building: group.building,
    room: group.room,
    startsAt: group.startsAt,
    note: group.note,
    experts: group.experts.map((expert) => ({ id: expert.user.id, name: displayName(expert.user) })),
    criteria: criteria.map((criterion) => ({ ...criterion, levels: criterion.levels as { score: number; text: string }[] })),
    markers,
    members: group.members.map(({ application }) => ({
      applicationId: application.id,
      name: fullName(application),
      // Своя оценка — первой: её и правят.
      reviews: application.reviews
        .map((review) => ({
          id: review.id,
          reviewer: { id: review.reviewerId, name: displayName(review.reviewer) },
          isMine: review.reviewerId === viewerId,
          scores: Object.fromEntries(review.scores.map((score) => [score.criterionId, score.score])),
          markers: Object.fromEntries(review.markers.map((marker) => [marker.markerId, marker.note])),
          comment: review.comment ?? "",
          summary: reviewSummary(criteria, review.scores),
          updatedAt: review.updatedAt,
          updatedBy: review.updatedById ? (nameOf.get(review.updatedById) ?? null) : null,
          touched: review.updatedById !== null,
        }))
        .sort((a, b) => Number(b.isMine) - Number(a.isMine)),
    })),
  };
}
