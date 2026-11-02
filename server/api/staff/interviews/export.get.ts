import { interviewExportFile } from "~~/lib/interviews/export-data";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Текущие собеседования: лист=день, строка=МО, столбец=время. */
export default defineEventHandler(async event => {
  const actor = await requirePermission(event, "interviews.manage");
  const seasonId = await requireCurrentSeasonId();
  const file = await interviewExportFile(seasonId);
  await audit(event, { actorId: actor.id, action: "interview.export", entityType: "season", entityId: seasonId, meta: { days: file.days, slots: file.slots } });
  setHeader(event, "content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setHeader(event, "content-disposition", 'attachment; filename="sha-interviews.xlsx"');
  setHeader(event, "cache-control", "private, no-store");
  return file.bytes;
});
