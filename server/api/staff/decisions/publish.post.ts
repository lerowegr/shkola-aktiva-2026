import { z } from "zod";

import { FINAL_STAGE, publishDecisions } from "~~/lib/applications/decisions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({});

/** Опубликовать итоги отбора: кандидаты увидят результат и получат уведомление. */
export default defineAction(schema, async ({ event }) => {
  const actor = await requirePermission(event, "applications.decide");
  const result = await publishDecisions(await requireCurrentSeasonId(), FINAL_STAGE);

  if (result.passed + result.rejected === 0) {
    return { ok: false, message: "Публиковать нечего: новых решений нет." };
  }

  await audit(event, { actorId: actor.id, action: "decision.publish", meta: { stage: FINAL_STAGE, ...result } });
  return { ok: true, message: `Опубликовано. Проходят: ${result.passed}, не проходят: ${result.rejected}.` };
});
