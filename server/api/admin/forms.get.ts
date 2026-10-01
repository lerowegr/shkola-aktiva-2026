import { loadEditor } from "~~/lib/admin/forms";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  await requirePermission(event, "forms.manage");
  return loadEditor(await requireCurrentSeasonId());
});
