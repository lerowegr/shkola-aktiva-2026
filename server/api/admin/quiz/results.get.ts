import { testOverview } from "~~/lib/games/sha-test-store";
import { can } from "~~/lib/permissions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Итоги «Теста про ША» — без личных данных: те только в CSV. */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "forms.manage");
  return { stats: await testOverview(await requireCurrentSeasonId()), canExport: can(user, "applications.view_all") };
});
