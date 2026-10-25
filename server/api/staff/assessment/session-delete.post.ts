import { z } from "zod";

import { deleteSession } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Удалить сбор вместе с подгруппами и приглашениями. */
export default defineAction(z.object({ id: z.string().min(1) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await deleteSession(await requireCurrentSeasonId(), body.id);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "assessment.session.delete",
    entityType: "assessment_session",
    entityId: body.id,
    meta: { title: result.title, invites: result.invites, groups: result.groups },
  });
  return {
    ok: true,
    message: result.invites
      ? `Сбор удалён. Приглашённые (${result.invites}) снова без приглашения — их можно пригласить на другой сбор.`
      : "Сбор удалён.",
  };
});
