import { SECTION_LABELS, siteContentSchema } from "~~/lib/site/content";
import { saveSiteContent } from "~~/lib/site/store";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Тексты сайта целиком. В журнал — какие разделы поменялись и сколько фото убрано. */
export default defineAction(siteContentSchema, async ({ body, event }) => {
  const actor = await requirePermission(event, "content.manage");
  const result = await saveSiteContent(await requireCurrentSeasonId(), body, actor.id);
  if (!result.ok) return result;
  if (result.changed.length === 0) return { ok: true, message: "Изменений нет." };

  await audit(event, {
    actorId: actor.id,
    action: "content.update",
    entityType: "site",
    meta: {
      sections: result.changed,
      label: result.changed.map((key) => SECTION_LABELS[key]).join(", "),
      removedImages: result.removedImages,
    },
  });
  return { ok: true, message: "Сохранено. Сайт уже обновился." };
});
