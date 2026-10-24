import { z } from "zod";

import { bookAssessment } from "~~/lib/assessment/candidate";
import { requireProfile } from "~~/server/utils/session";

const schema = z.object({ groupId: z.string().min(1) });

/** Записаться на дату центра оценки или перенести запись. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireProfile(event);
  return bookAssessment(user.id, body.groupId);
});
