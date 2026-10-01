import { z } from "zod";

import { publishDecisions } from "~~/lib/applications/decisions";
import { EVALUATED_STAGES } from "~~/lib/applications/staff";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ stage: z.enum(EVALUATED_STAGES) });

/** Опубликовать решения этапа: кандидаты увидят результат и получат уведомление. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.decide");
  const result = await publishDecisions(await requireCurrentSeasonId(), body.stage);

  if (result.passed + result.rejected === 0) {
    return { ok: false, message: "Публиковать нечего: новых решений нет." };
  }

  await audit(event, { actorId: actor.id, action: "decision.publish", meta: { stage: body.stage, ...result } });
  return { ok: true, message: `Опубликовано. Проходят: ${result.passed}, не проходят: ${result.rejected}.` };
});
