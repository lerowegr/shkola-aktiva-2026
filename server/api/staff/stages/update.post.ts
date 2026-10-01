import { z } from "zod";

import { db } from "~~/lib/db";
import { requirePermission } from "~~/server/utils/session";

const date = z
  .string()
  .datetime({ offset: true, message: "Дата указана неверно." })
  .nullable();

const schema = z.object({
  stageId: z.string().min(1),
  opensAt: date,
  closesAt: date,
  mode: z.enum(["AUTO", "OPEN", "CLOSED"]),
  description: z.string().max(5000, "Текст не длиннее 5000 знаков.").optional(),
});

/**
 * Даты и режим этапа. От них зависит, какие вкладки открыты кандидатам и
 * организаторам, поэтому каждое изменение — в журнал.
 */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "stages.manage");

  const opensAt = body.opensAt ? new Date(body.opensAt) : null;
  const closesAt = body.closesAt ? new Date(body.closesAt) : null;

  if (opensAt && closesAt && closesAt <= opensAt) {
    return { ok: false, message: "Этап должен закрываться позже, чем открывается." };
  }

  const before = await db.stage.findUnique({
    where: { id: body.stageId },
    select: { title: true, opensAt: true, closesAt: true, mode: true, description: true },
  });
  if (!before) return { ok: false, message: "Этап не найден — обновите страницу." };

  const description = body.description === undefined ? undefined : body.description.trim() || null;
  await db.stage.update({ where: { id: body.stageId }, data: { opensAt, closesAt, mode: body.mode, description } });

  await audit(event, {
    actorId: actor.id,
    action: "stage.update",
    entityType: "stage",
    entityId: body.stageId,
    meta: { title: before.title, before, after: { opensAt, closesAt, mode: body.mode, description } },
  });

  return { ok: true, message: `«${before.title}» сохранён.` };
});
