import { db } from "~~/lib/db";
import { fullName } from "~~/lib/applications/staff";
import { displayName } from "~~/lib/auth/actor";
import { buildInterviewExport } from "~~/lib/interviews/export";
import { createInterviewWorkbook } from "~~/lib/interviews/export-workbook";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/** Текущие собеседования: лист=день, строка=МО, столбец=время. */
export default defineEventHandler(async event => {
  const actor = await requirePermission(event, "interviews.manage");
  const seasonId = await requireCurrentSeasonId();
  const slots = await db.interviewSlot.findMany({
    where: { seasonId, archivedAt: null }, orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { startsAt: true, endsAt: true, location: true, room: true, interviewers: { select: { user: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } } }, bookings: { where: { cancelledAt: null }, select: { application: { select: { firstName: true, lastName: true, middleName: true } } } } },
  });
  const days = buildInterviewExport(slots.flatMap(s => s.interviewers.flatMap(i => (s.bookings.length ? s.bookings : [null]).map(b => ({ startsAt: s.startsAt, endsAt: s.endsAt, location: s.location, room: s.room, master: displayName(i.user), candidate: b ? fullName(b.application) : null })))));
  const book = createInterviewWorkbook(days);
  const bytes = await book.xlsx.writeBuffer();
  await audit(event, { actorId: actor.id, action: "interview.export", entityType: "season", entityId: seasonId, meta: { days: days.length, slots: slots.length } });
  setHeader(event, "content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setHeader(event, "content-disposition", 'attachment; filename="sha-interviews.xlsx"');
  setHeader(event, "cache-control", "private, no-store");
  return Buffer.from(bytes);
});
