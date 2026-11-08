import { z } from "zod";

import { FINAL_STAGE, promoteReserve } from "~~/lib/applications/decisions";
import { notify } from "~~/lib/notifications/notify";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ applicationId: z.string().min(1) });

/** Явно пригласить кандидата из опубликованного резерва на освободившееся место. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.decide");
  const result = await promoteReserve(body.applicationId, await requireCurrentSeasonId(), actor.id);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "decision.reserve_promoted",
    entityType: "application",
    entityId: body.applicationId,
    meta: { stage: FINAL_STAGE, from: "RESERVE", to: "PASSED" },
  });
  await notify([{
    userId: result.userId!,
    category: "SELECTION",
    title: "Вы в Школе Актива!",
    body: "Для вас освободилось место — вы прошли в Школу Актива! Подробности о старте пришлём в ближайшие дни.",
    url: "/cabinet/interview",
    key: `decision:promoted:${result.decisionId}`,
  }]);
  return { ok: true, message: "Кандидат переведён из резерва и получит уведомление." };
});
