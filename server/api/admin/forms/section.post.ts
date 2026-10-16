import { z } from "zod";

import { saveSection } from "~~/lib/admin/forms";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Раздел анкеты: новый или переименовать / поправить описание. */
const schema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().max(60, "Название раздела — не длиннее 60 знаков."),
  description: z.string().max(1000, "Описание — не длиннее 1000 знаков.").nullable(),
  homework: z.boolean().default(false),
});

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await saveSection(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "form.section", entityType: "section", entityId: body.id, meta: { title: body.title, homework: body.homework } });
  return { ok: true, message: "Раздел сохранён." };
});
