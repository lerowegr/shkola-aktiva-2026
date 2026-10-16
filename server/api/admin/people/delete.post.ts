import { z } from "zod";

import { deleteCheck, deleteOrganizer } from "~~/lib/admin/people";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ userId: z.string().min(1), successorId: z.string().min(1).nullable().default(null) });

/**
 * Удалить организатора совсем. Только у кого есть и «люди», и «роли» —
 * то есть у тех.админа; работа удаляемого передаётся преемнику.
 */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");
  await requirePermission(event, "roles.manage");

  const before = await deleteCheck(body.userId);
  const result = await deleteOrganizer(actor, body.userId, body.successorId);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "user.delete",
    entityType: "user",
    entityId: body.userId,
    meta: { name: result.name, successorId: body.successorId, moved: result.moved, work: before },
  });
  return {
    ok: true,
    message: result.moved ? `${result.name} удалён(а). Работа передана: ${result.moved}.` : `${result.name} удалён(а).`,
  };
});
