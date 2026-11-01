import { db } from "~~/lib/db";
import { fullName } from "~~/lib/applications/staff";
import { facultyMatches, type FacultyFilter } from "~~/lib/profile/faculty";
import { groupNonAttendance } from "./attendance-report";

export async function nonAttendanceReport(seasonId: string, faculty: FacultyFilter = "", now = new Date()) {
  const [season, sessions, applications] = await Promise.all([
    db.season.findUniqueOrThrow({ where: { id: seasonId }, select: { year: true } }),
    db.assessmentSession.findMany({ where: { seasonId }, select: { id: true, startsAt: true, invited: true, reserve: true } }),
    db.application.findMany({ where: { seasonId, status: "SUBMITTED" }, select: {
      id: true, firstName: true, lastName: true, middleName: true,
      user: { select: { faculty: true } },
      assessmentInvite: { select: { attended: true, answer: true, reserveQueued: true, invitedDay: true, sessionId: true } },
    } }),
  ]);
  return groupNonAttendance(season.year, sessions, applications.filter(a => facultyMatches(a.user.faculty, faculty)).map(a => ({ id: a.id, name: fullName(a), faculty: a.user.faculty, invite: a.assessmentInvite })), now);
}
