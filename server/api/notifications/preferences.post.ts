import { z } from "zod";

import { setPreference } from "~~/lib/notifications/inbox";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({
  channel: z.enum(["TELEGRAM", "PUSH"]),
  category: z.enum(["SELECTION", "MESSAGES", "REVIEW", "SYSTEM"]),
  enabled: z.boolean(),
});

export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  await setPreference(user.id, body.channel, body.category, body.enabled);
  return { ok: true };
});
