import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

export async function assessmentFixture(now: Date) {
  await resetDatabase();
  const season = await db.season.create({ data: { slug: "assessment-test", title: "S", year: 2030, isCurrent: true } });
  await db.stage.create({ data: { seasonId: season.id, kind: "ASSESSMENT", title: "Центр оценки", order: 3 } });
  let index = 0;
  const slot = (extra: { startsAt?: Date; faculties?: string[]; capacity?: number; reserve?: boolean; title?: string } = {}) => db.assessmentSession.create({ data: { seasonId: season.id, title: "Время ЦО", startsAt: new Date("2030-10-26T14:00:00Z"), building: "2", room: "305", faculties: ["МЭО"], capacity: 50, ...extra } });
  async function person(sessionId: string, options: { faculty?: string | null; answer?: "GOING" | "RESERVE" | "CANT" | null; queued?: boolean } = {}) {
    index++;
    const user = await db.user.create({ data: { firstName: `Кандидат ${index}`, faculty: options.faculty === undefined ? "МЭО" : options.faculty, telegramId: String(800000 + index) } });
    const application = await db.application.create({ data: { seasonId: season.id, userId: user.id, firstName: user.firstName, status: "SUBMITTED", submittedAt: now } });
    const invite = await db.assessmentInvite.create({ data: { sessionId, applicationId: application.id, answer: options.answer ?? null, reserveQueued: options.queued ?? false, answeredAt: options.answer ? new Date(now.getTime() + index) : null } });
    return { userId: user.id, applicationId: application.id, inviteId: invite.id };
  }
  return { seasonId: season.id, slot, person };
}
