import { z } from "zod";

import { answerInvite, chooseSlot } from "~~/lib/assessment/candidate";
import { placeMember } from "~~/lib/assessment/groups";
import { db } from "~~/lib/db";
import { requireProfile } from "~~/server/utils/session";

const schema = z.object({
  answer: z.enum(["GOING", "RESERVE", "CANT"], { error: "Выберите ответ." }),
  /** «Буду» на другое время того же дня. */
  sessionId: z.string().min(1).optional(),
});

/** Ответ на приглашение на центр оценки. Действие кандидата — в журнал не пишется. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireProfile(event);
  if (body.answer !== "GOING" || !body.sessionId) return answerInvite(user.id, body.answer);

  const result = await chooseSlot(user.id, body.sessionId);
  if (result.ok && result.movedFrom) {
    // Подгруппа прежнего времени ему больше не подходит — организатор разложит заново.
    const member = await db.assessmentMember.findFirst({
      where: { application: { userId: user.id }, group: { sessionId: result.movedFrom } },
      select: { applicationId: true, group: { select: { seasonId: true } } },
    });
    if (member) await placeMember(member.group.seasonId, member.applicationId, null, null);
  }
  return result.ok ? { ok: true, message: result.message } : result;
});
