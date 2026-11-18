import { z } from "zod";
import { selectionCsv } from "~~/lib/participation/export";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "applications.decide");
  const seasonId = await requireCurrentSeasonId();
  const kind = z.enum(["completed", "participation"]).safeParse(getQuery(event).kind);
  if (!kind.success) throw createError({ statusCode: 400, statusMessage: "Выберите тип выгрузки." });
  const file = await selectionCsv(seasonId, kind.data);
  await audit(event, { actorId: actor.id, action: "decision.export", entityType: "season", entityId: seasonId, meta: { kind: kind.data, count: file.count } });
  setHeader(event, "Content-Type", "text/csv; charset=utf-8");
  setHeader(event, "Content-Disposition", `attachment; filename="sha-${kind.data}.csv"`);
  setHeader(event, "Cache-Control", "private, no-store");
  return file.text;
});
