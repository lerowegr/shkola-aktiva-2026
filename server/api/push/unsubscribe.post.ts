import { z } from "zod";

import { db } from "~~/lib/db";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({ endpoint: z.string().min(1).max(1000) });

export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: user.id } });
  return { ok: true, message: "Уведомления на этом устройстве выключены." };
});
