import { z } from "zod";

import { deleteGroup } from "~~/lib/assessment/groups";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ id: z.string().min(1) });

/** Удалить подгруппу; её кандидаты становятся нераспределёнными. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");
  const result = await deleteGroup(await requireCurrentSeasonId(), body.id);
  if (!result.ok) return result;

  await audit(event, {
    actorId: actor.id,
    action: "assessment.group.delete",
    entityType: "assessment_group",
    entityId: body.id,
    meta: { title: result.title, members: result.members, kept: result.kept },
  });
  const parts = ["Подгруппа удалена."];
  if (result.members) parts.push(`Кандидаты (${result.members}) — снова нераспределённые.`);
  if (result.kept) parts.push(`Начатые оценки (${result.kept}) сохранены.`);
  return { ok: true, message: parts.join(" ") };
});
