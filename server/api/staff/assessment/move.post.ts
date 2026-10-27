import { z } from "zod";

import { moveCandidate } from "~~/lib/assessment/sessions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  /** id сбора, «reserve» — очередь на резервный день, «cant» — не придёт. */
  to: z.string().min(1, "Выберите, куда перенести."),
  notify: z.boolean().default(true),
});

/** Организатор вручную переносит кандидата: другое время, резерв, «не придёт». */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const target =
    body.to === "reserve" ? { kind: "reserve" as const } : body.to === "cant" ? { kind: "cant" as const } : { kind: "session" as const, sessionId: body.to };
  const result = await moveCandidate(await requireCurrentSeasonId(), body.applicationId, target, {
    notifyCandidate: body.notify,
    actorId: actor.id,
  });
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "assessment.move",
    entityType: "application",
    entityId: body.applicationId,
    meta: { to: result.label, notified: body.notify && target.kind !== "cant", leftGroup: result.fromGroup },
  });
  const parts = [`${result.name}: ${result.label}.`];
  if (result.fromGroup) parts.push("Из прежней подгруппы убран — положите в подгруппу нового дня.");
  if (result.over) parts.push("Внимание: на этом сборе «буду» уже больше, чем мест.");
  return { ok: true, message: parts.join(" ") };
});
