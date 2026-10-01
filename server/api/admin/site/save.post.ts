import { SECTION_LABELS, siteContentSchema } from "~~/lib/site/content";
import { saveSiteContent } from "~~/lib/site/store";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Тексты сайта целиком. В журнал — какие разделы поменялись. */
export default defineAction(siteContentSchema, async ({ body, event }) => {
  const actor = await requirePermission(event, "content.manage");
  const { changed } = await saveSiteContent(await requireCurrentSeasonId(), body, actor.id);
  if (changed.length === 0) return { ok: true, message: "Изменений нет." };

  await audit(event, {
    actorId: actor.id,
    action: "content.update",
    entityType: "site",
    meta: { sections: changed, label: changed.map((key) => SECTION_LABELS[key]).join(", ") },
  });
  return { ok: true, message: "Сохранено. Сайт уже обновился." };
});
