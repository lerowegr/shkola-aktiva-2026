import { DEFAULT_CONTENT } from "~~/lib/site/content";
import { loadSiteContent } from "~~/lib/site/store";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  await requirePermission(event, "content.manage");
  return { content: await loadSiteContent(await requireCurrentSeasonId()), defaults: DEFAULT_CONTENT };
});
