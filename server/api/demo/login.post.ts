import { z } from "zod";

import { DEMO_DOMAIN } from "~~/lib/demo/scenario";
import { db } from "~~/lib/db";
import { startSession } from "~~/server/utils/session";

/** Демо: войти как выдуманный человек — без пароля, только на демо-копии. */
export default defineAction(z.object({ userId: z.string().min(1) }), async ({ body, event }) => {
  requireDemo(event);
  const user = await db.user.findFirst({
    where: { id: body.userId, email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true },
  });
  if (!user) return { ok: false, message: "Такого демо-входа нет — нажмите «Сбросить демо»." };
  await startSession(event, user.id);
  return { ok: true };
});
