import { z } from "zod";

import { answerInvite, chooseSlot } from "~~/lib/assessment/candidate";
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

  return chooseSlot(user.id, body.sessionId);
});
