import { z } from "zod";

import { rankForStage, setDecision } from "~~/lib/applications/decisions";
import { EVALUATED_STAGES } from "~~/lib/applications/staff";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  stage: z.enum(EVALUATED_STAGES),
  threshold: z.number().min(0).max(1000),
});

/**
 * Порог: всех с итогом от N — «проходит», остальных проверенных — «не
 * проходит». Непроверенных и уже опубликованных не трогаем.
 */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.decide");
  const rows = await rankForStage(await requireCurrentSeasonId(), body.stage);

  let passed = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.published || row.average === null) continue;
    const outcome = row.average >= body.threshold ? "PASSED" : "REJECTED";
    const result = await setDecision(row.id, body.stage, outcome, actor.id);
    if (result.ok) {
      if (outcome === "PASSED") passed++;
      else rejected++;
    }
  }

  await audit(event, {
    actorId: actor.id,
    action: "decision.bulk",
    meta: { stage: body.stage, threshold: body.threshold, passed, rejected },
  });

  return { ok: true, message: `Проходят: ${passed}, не проходят: ${rejected}. Это ещё черновик — опубликуйте, когда будете готовы.` };
});
