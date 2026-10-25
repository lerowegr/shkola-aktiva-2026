import { z } from "zod";

import { answerInvite } from "~~/lib/assessment/candidate";
import { requireProfile } from "~~/server/utils/session";

const schema = z.object({ answer: z.enum(["GOING", "RESERVE", "CANT"], { error: "Выберите ответ." }) });

/** Ответ на приглашение на центр оценки. Действие кандидата — в журнал не пишется. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireProfile(event);
  return answerInvite(user.id, body.answer);
});
