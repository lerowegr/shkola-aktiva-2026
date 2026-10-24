import { z } from "zod";

import { cancelAssessment } from "~~/lib/assessment/candidate";
import { requireProfile } from "~~/server/utils/session";

/** Отменить свою запись на центр оценки. */
export default defineAction(z.object({}), async ({ event }) => {
  const user = await requireProfile(event);
  return cancelAssessment(user.id);
});
