import { z } from "zod";

import { cancel } from "~~/lib/interviews/booking";
import { requireSignedIn } from "~~/server/utils/session";

export default defineAction(z.object({}), async ({ event }) => {
  const user = await requireSignedIn(event);
  return cancel(user.id);
});
