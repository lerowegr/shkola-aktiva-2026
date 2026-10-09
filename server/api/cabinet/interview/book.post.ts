import { z } from "zod";

import { book } from "~~/lib/interviews/booking";
import { requireProfile } from "~~/server/utils/session";

const schema = z.object({ slotId: z.string().min(1) });

/** Записаться или перенести запись на другое время. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireProfile(event);
  return book(user.id, body.slotId);
});
