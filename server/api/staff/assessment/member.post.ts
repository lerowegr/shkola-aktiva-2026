import { z } from "zod";

import { placeMember } from "~~/lib/assessment/groups";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ applicationId: z.string().min(1), groupId: z.string().min(1).nullable() });

/** Положить кандидата в группу, перенести или убрать из групп. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await placeMember(await requireCurrentSeasonId(), body.applicationId, body.groupId, actor.id);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "assessment.member",
    entityType: "application",
    entityId: body.applicationId,
    meta: { from: result.from, to: result.to, keptReviews: result.kept },
  });

  const message = !result.to
    ? "Кандидат убран из групп."
    : result.kept > 0
      ? `Перенесли в «${result.to}». Начатые оценки прежних экспертов сохранены.`
      : `Кандидат в группе «${result.to}».`;
  return { ok: true, message };
});
