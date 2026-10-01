import { DEFAULT_CONTENT } from "~~/lib/site/content";
import { imagesMeta, loadSiteContent } from "~~/lib/site/store";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  await requirePermission(event, "content.manage");
  const seasonId = await requireCurrentSeasonId();
  const [content, images] = await Promise.all([loadSiteContent(seasonId), imagesMeta(seasonId)]);
  return { content, defaults: DEFAULT_CONTENT, images };
});
