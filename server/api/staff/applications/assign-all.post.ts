import { z } from "zod";

import { assignUnassigned } from "~~/lib/applications/assign";
import { EVALUATED_STAGES } from "~~/lib/applications/staff";
import { notifyAssigned } from "~~/lib/applications/notifications";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Раздать мастерам все анкеты, которые пришли, пока мастеров не было. */
const schema = z.object({ stage: z.enum(EVALUATED_STAGES).default("APPLICATION") });

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const reviewIds = await assignUnassigned(await requireCurrentSeasonId(), body.stage, actor.id);
  const count = reviewIds.length;

  if (count === 0) {
    return { ok: false, message: "Распределять некого: нераспределённых анкет нет или нет ни одного мастера." };
  }

  await audit(event, { actorId: actor.id, action: "application.assign_all", meta: { count, stage: body.stage } });
  await notifyAssigned(reviewIds, body.stage);
  return { ok: true, message: `Распределено анкет: ${count}.` };
});
