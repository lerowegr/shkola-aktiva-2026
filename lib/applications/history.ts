import { db } from "~~/lib/db";
import type { CurrentUser } from "~~/lib/auth/actor";
import { displayName } from "~~/lib/auth/actor";
import { can } from "~~/lib/permissions";
import { reviewSummary, type ReviewStatus } from "./review";

export interface ReviewHistory {
  stages: { label: string; reviews: { reviewer: string; percent: number | null; status: ReviewStatus; total: number | null; max: number; comment: string; criteria: { title: string; max: number; score: number | null; comment: string | null }[]; markers: { title: string; note: string }[] }[] }[];
}
export async function loadReviewHistory(applicationId: string, seasonId: string, actor: CurrentUser): Promise<ReviewHistory | null | false> {
  if (actor.status !== "ACTIVE") return false;
  const app = await db.application.findFirst({ where: { id: applicationId, seasonId, status: "SUBMITTED" }, select: { reviews: { where: { reviewerId: actor.id, stageKind: "INTERVIEW", releasedAt: null }, select: { id: true } } } });
  if (!app) return null;
  if (!can(actor, "applications.view_all") && !(can(actor, "applications.review") && app.reviews.length)) return false;
  const stages = [{ kind: "APPLICATION", label: "Анкета" }, { kind: "HOMEWORK", label: "Домашнее задание" }, { kind: "ASSESSMENT", label: "Центр оценки" }] as const;
  const [criteria, reviews] = await Promise.all([
    db.criterion.findMany({ where: { seasonId, stageKind: { in: stages.map(s => s.kind) } }, orderBy: { order: "asc" }, select: { id: true, title: true, stageKind: true, maxScore: true } }),
    db.review.findMany({ where: { applicationId, stageKind: { in: stages.map(s => s.kind) } }, orderBy: { assignedAt: "asc" }, select: { stageKind: true, comment: true, reviewer: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } }, scores: { select: { criterionId: true, score: true, comment: true } }, markers: { where: { note: { not: "" } }, select: { note: true, marker: { select: { title: true } } } } } }),
  ]);
  return { stages: stages.map(stage => {
    const fields = criteria.filter(c => c.stageKind === stage.kind);
    return { label: stage.label, reviews: reviews.filter(r => r.stageKind === stage.kind).map(r => {
      const summary = reviewSummary(fields, r.scores);
      return { reviewer: displayName(r.reviewer), ...summary, percent: summary.status === "done" && summary.max > 0 ? Math.round((summary.total ?? 0) / summary.max * 100) : null, comment: r.comment ?? "", criteria: fields.map(c => ({ title: c.title, max: c.maxScore, score: r.scores.find(s => s.criterionId === c.id)?.score ?? null, comment: r.scores.find(s => s.criterionId === c.id)?.comment ?? null })), markers: r.markers.map(m => ({ title: m.marker.title, note: m.note })) };
    }) };
  }) };
}
