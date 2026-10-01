import { z } from "zod";

import { db } from "~~/lib/db";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/**
 * Подписать это устройство на пуши.
 *
 * Подписка привязана к браузеру, а не к человеку: если на телефоне
 * вошёл другой человек, она переходит к нему — пуши прежнего хозяина на
 * чужой телефон приходить не должны.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);

  await db.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: getRequestHeader(event, "user-agent")?.slice(0, 300) ?? null,
    },
    update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
  });

  return { ok: true, message: "Уведомления на этом устройстве включены." };
});
