import { z } from "zod";

import { db } from "~~/lib/db";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const query = z.object({ applicationId: z.string().min(1) });

/** Внутренние заметки к кандидату; кандидатский кабинет их не запрашивает. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "applications.decide");
  const { applicationId } = query.parse(getQuery(event));
  const seasonId = await requireCurrentSeasonId();
  const comments = await db.finalDecisionComment.findMany({
    where: { applicationId, application: { seasonId, status: "SUBMITTED" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, body: true, createdAt: true, author: { select: { firstName: true, lastName: true } } },
  });
  return {
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      author: [comment.author?.firstName, comment.author?.lastName].filter(Boolean).join(" ") || "Организатор",
    })),
  };
});
