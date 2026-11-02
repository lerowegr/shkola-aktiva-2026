import { db } from "~~/lib/db";
import { fullName } from "~~/lib/applications/staff";
import { displayName } from "~~/lib/auth/actor";
import { buildInterviewExport } from "./export";
import { createInterviewWorkbook } from "./export-workbook";

/** Единый снимок для выгрузки на сайте и в Telegram. Права проверяет вызывающий код. */
export async function interviewExportFile(seasonId: string) {
  const slots = await db.interviewSlot.findMany({
    where: { seasonId, archivedAt: null }, orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { startsAt: true, endsAt: true, location: true, room: true, interviewers: { select: { user: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } } } }, bookings: { where: { cancelledAt: null }, select: { application: { select: { firstName: true, lastName: true, middleName: true } } } } },
  });
  const days = buildInterviewExport(slots.flatMap(s => s.interviewers.flatMap(i => (s.bookings.length ? s.bookings : [null]).map(b => ({ startsAt: s.startsAt, endsAt: s.endsAt, location: s.location, room: s.room, master: displayName(i.user), candidate: b ? fullName(b.application) : null })))));
  const bytes = await createInterviewWorkbook(days).xlsx.writeBuffer();
  return { bytes: Buffer.from(bytes), days: days.length, slots: slots.length };
}
