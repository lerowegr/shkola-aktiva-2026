import { z } from "zod";

import { inviteSession } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  sessionId: z.string().min(1),
  /** Пригласить именно этих (например, без факультета). Без списка — факультеты сбора. */
  applicationIds: z.array(z.string().min(1)).max(500).optional(),
});

/** «Пригласить на центр оценки». */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await inviteSession(await requireCurrentSeasonId(), body.sessionId, body.applicationIds);
  if (!result.ok) return result;
  if (result.invited) {
    await audit(event, {
      actorId: actor.id,
      action: "assessment.session.invite",
      entityType: "assessment_session",
      entityId: body.sessionId,
      meta: { invited: result.invited, manual: Boolean(body.applicationIds) },
    });
  }
  const skipped = result.skipped ? ` Уже приглашены раньше: ${result.skipped}.` : "";
  return {
    ok: true,
    invited: result.invited,
    message: result.invited ? `Приглашено: ${result.invited}.${skipped}` : `Новых кандидатов для приглашения нет.${skipped}`,
  };
});
