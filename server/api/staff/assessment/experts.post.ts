import { z } from "zod";

import { notifyAssigned } from "~~/lib/applications/notifications";
import { setExperts } from "~~/lib/assessment/groups";
import { db } from "~~/lib/db";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ groupId: z.string().min(1), userIds: z.array(z.string().min(1)).max(30) });

/** Эксперты группы целиком. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await setExperts(await requireCurrentSeasonId(), body.groupId, body.userIds, actor.id);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "assessment.experts",
    entityType: "assessment_group",
    entityId: body.groupId,
    meta: { added: result.added, removed: result.removed },
  });

  // Новому эксперту — одно уведомление на группу, а не на каждого кандидата.
  if (result.added.length) {
    const reviews = await db.review.findMany({
      where: { stageKind: "ASSESSMENT", reviewerId: { in: result.added }, application: { assessment: { groupId: body.groupId } } },
      distinct: ["reviewerId"],
      select: { id: true },
    });
    await notifyAssigned(reviews.map((review) => review.id), "ASSESSMENT");
  }

  return { ok: true, message: "Эксперты сохранены." };
});
