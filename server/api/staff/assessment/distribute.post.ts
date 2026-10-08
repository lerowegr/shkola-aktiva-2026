import { z } from "zod";

import { distribute } from "~~/lib/assessment/groups";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Кандидаты без группы — поровну по группам. */
export default defineAction(z.object({}), async ({ event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await distribute(await requireCurrentSeasonId(), actor.id);
  if (!result.ok) return result;

  await audit(event, { actorId: actor.id, action: "assessment.distribute", meta: { placed: result.placed } });
  return { ok: true, message: `Разложили по группам: ${result.placed}.` };
});
