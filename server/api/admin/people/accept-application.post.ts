import { z } from "zod";

import { acceptApplicationByStaff } from "~~/lib/applications/accept-by-staff";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requestMeta } from "~~/server/utils/request-meta";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ userId: z.string().min(1), sessionId: z.string().min(1) });

/** Организатор явно принимает сохранённую анкету одного человека и приглашает его на ЦО. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");
  await requirePermission(event, "applications.assign");
  return acceptApplicationByStaff({ seasonId: await requireCurrentSeasonId(), userId: body.userId, actorId: actor.id, sessionId: body.sessionId }, requestMeta(event));
});
