import { z } from "zod";

import { rankForStage } from "~~/lib/applications/decisions";
import { EVALUATED_STAGES } from "~~/lib/applications/staff";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const query = z.object({ stage: z.enum(EVALUATED_STAGES).default("APPLICATION") });

/** Рейтинг этапа с решениями — страница «Решения». */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "applications.decide");
  const { stage } = query.parse(getQuery(event));
  return { stage, rows: await rankForStage(await requireCurrentSeasonId(), stage) };
});
