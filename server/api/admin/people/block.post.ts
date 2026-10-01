import { z } from "zod";

import { setBlocked } from "~~/lib/admin/people";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ userId: z.string().min(1), blocked: z.boolean() });

/** Заблокировать или вернуть доступ. Блокировка сразу закрывает все сессии. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");
  const result = await setBlocked(actor, body.userId, body.blocked);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: body.blocked ? "user.block" : "user.unblock", entityType: "user", entityId: body.userId });
  return { ok: true, message: body.blocked ? "Доступ закрыт." : "Доступ возвращён." };
});
