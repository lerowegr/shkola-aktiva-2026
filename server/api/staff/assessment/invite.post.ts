import { z } from "zod";

import { inviteSession } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  sessionId: z.string().min(1),
  faculty: z.string().min(1).optional(),
  /** Пригласить именно этих (например, без факультета). Без списка — факультеты сбора. */
  applicationIds: z.array(z.string().min(1)).max(500).optional(),
});

/** «Пригласить на центр оценки». */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await inviteSession(await requireCurrentSeasonId(), body.sessionId, body.applicationIds, body.faculty);
  if (!result.ok) return result;
  if (result.invited) {
    await audit(event, {
      actorId: actor.id,
      action: "assessment.session.invite",
      entityType: "assessment_session",
      entityId: body.sessionId,
      meta: { invited: result.invited, faculty: body.faculty, manual: Boolean(body.applicationIds) },
    });
  }
  const skipped = result.skipped ? ` Уже приглашены раньше: ${result.skipped}.` : "";
  const overflow = result.overflow ? ` Из них в следующие слоты: ${result.overflow}.` : "";
  const unplaced = result.unplaced ? ` Без приглашения из-за нехватки мест: ${result.unplaced}. Создайте следующий слот подходящего факультета и повторите приглашение.` : "";
  return {
    ok: true,
    invited: result.invited,
    unplaced: result.unplaced,
    overflow: result.overflow,
    message: result.invited ? `Приглашено на день: ${result.invited}. Время кандидаты выбирают сами.${overflow}${skipped}${unplaced}` : `Новых кандидатов для приглашения нет.${skipped}`,
  };
});
