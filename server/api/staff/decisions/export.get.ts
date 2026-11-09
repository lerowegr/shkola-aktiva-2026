import { finalDecisionExportFile } from "~~/lib/applications/final-export";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Внутренние списки принятых и резерва, включая неопубликованные решения. */
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "applications.decide");
  const seasonId = await requireCurrentSeasonId();
  const file = await finalDecisionExportFile(seasonId);
  await audit(event, {
    actorId: actor.id,
    action: "decision.export",
    entityType: "season",
    entityId: seasonId,
    meta: { passed: file.passed, reserve: file.reserve },
  });
  setHeader(event, "content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setHeader(event, "content-disposition", 'attachment; filename="sha-final-lists.xlsx"');
  setHeader(event, "cache-control", "private, no-store");
  return file.bytes;
});
