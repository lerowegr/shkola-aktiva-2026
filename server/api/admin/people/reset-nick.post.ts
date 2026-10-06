import { z } from "zod";

import { db } from "~~/lib/db";
import { resetNickname } from "~~/lib/profile/nickname";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ id: z.string().min(1) });

/** Сбросить чужой ник (против самозванцев). */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");
  const target = await db.user.findUnique({ where: { id: body.id }, select: { nickname: true } });
  const result = await resetNickname(body.id);
  if (!result.ok) return result;
  await audit(event, {
    actorId: actor.id,
    action: "profile.reset_nick",
    entityType: "user",
    entityId: body.id,
    meta: { nickname: target?.nickname ?? null },
  });
  return { ok: true, message: "Ник сброшен." };
});
