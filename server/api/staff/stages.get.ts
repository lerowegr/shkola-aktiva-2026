import { currentSeason } from "~~/lib/stages";
import { db } from "~~/lib/db";
import { requirePermission } from "~~/server/utils/session";

/** Этапы текущего сезона с датами и режимом — для страницы «Этапы». */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "stages.manage");
  const season = await currentSeason();
  if (!season) return { season: null };

  const extra = await db.stage.findMany({
    where: { seasonId: season.id },
    select: { id: true, mode: true, description: true },
  });
  const byId = new Map(extra.map((stage) => [stage.id, stage]));

  return {
    season: {
      title: season.title,
      stages: season.stages.map((stage) => ({
        ...stage,
        mode: byId.get(stage.id)?.mode ?? "AUTO",
        description: byId.get(stage.id)?.description ?? null,
      })),
    },
  };
});
