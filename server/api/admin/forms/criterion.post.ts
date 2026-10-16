import { z } from "zod";

import { saveCriterion } from "~~/lib/admin/forms";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  stage: z.enum(["APPLICATION", "HOMEWORK", "ASSESSMENT", "INTERVIEW"]),
  title: z.string().max(100),
  badge: z.string().max(40).nullable(),
  description: z.string().max(1000).nullable().default(null),
  indicators: z.string().max(3000).nullable().default(null),
  maxScore: z.number().int(),
  levels: z.array(z.object({ score: z.number().int(), text: z.string().max(1500) })).max(11),
});

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await saveCriterion(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "form.criterion", entityType: "criterion", entityId: body.id, meta: { stage: body.stage, title: body.title, maxScore: body.maxScore } });
  return { ok: true, message: "Критерий сохранён." };
});
