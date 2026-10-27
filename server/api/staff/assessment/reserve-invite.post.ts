import { z } from "zod";

import { inviteReserveQueue } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

export default defineAction(z.object({}), async ({ event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await inviteReserveQueue(await requireCurrentSeasonId());
  if (!result.ok) return result;
  if (result.invited)
    await audit(event, {
      actorId: actor.id,
      action: "assessment.reserve.invite",
      entityType: "assessment_session",
      entityId: result.sessionId,
      meta: { invited: result.invited, waiting: result.waiting },
    });
  return {
    ok: true,
    message: `Предложение выбрать резервное время отправлено: ${result.invited}. Ещё ждут рассылки: ${result.waiting}. Места закрепятся после выбора кандидатов.`,
  };
});
