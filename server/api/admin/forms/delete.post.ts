import { z } from "zod";

import { deleteCriterion, deleteMarker, deleteQuestion, deleteSection, itemTitle } from "~~/lib/admin/forms";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ kind: z.enum(["question", "criterion", "marker", "section"]), id: z.string().min(1) });

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const title = await itemTitle(body.kind, body.id);
  const result =
    body.kind === "section"
      ? await deleteSection(await requireCurrentSeasonId(), body.id)
      : body.kind === "question"
      ? await deleteQuestion(await requireCurrentSeasonId(), body.id)
      : body.kind === "criterion"
        ? await deleteCriterion(body.id)
        : await deleteMarker(body.id);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: `form.${body.kind}_delete`, entityType: body.kind, entityId: body.id, meta: { title } });
  return { ok: true };
});
