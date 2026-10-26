import { z } from "zod";

import { MESSAGE_MAX, messageSession } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ sessionId: z.string().min(1), text: z.string().max(MESSAGE_MAX * 2) });

/** Сообщение всем, кто идёт на этот сбор. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await messageSession(await requireCurrentSeasonId(), body.sessionId, body.text);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "assessment.session.message",
    entityType: "assessment_session",
    entityId: body.sessionId,
    meta: { sent: result.sent, text: body.text.trim() },
  });
  return { ok: true, message: `Отправили ${result.sent} кандидатам сбора «${result.title}».` };
});
