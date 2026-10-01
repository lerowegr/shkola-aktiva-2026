import { z } from "zod";

import { markRead } from "~~/lib/notifications/inbox";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({ ids: z.array(z.string().min(1)).max(100).optional() });

/** Прочитать перечисленные уведомления или все сразу. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  await markRead(user.id, body.ids ?? null);
  return { ok: true };
});
