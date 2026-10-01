import { z } from "zod";

import { SEGMENTS, sendBroadcast, type Segment } from "~~/lib/admin/broadcast";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  segment: z.enum(Object.keys(SEGMENTS) as [Segment, ...Segment[]]),
  title: z.string().trim().min(1, "Напишите заголовок.").max(120),
  body: z.string().trim().max(1500).nullable(),
  url: z
    .string()
    .trim()
    .regex(/^\/[^/]/, "Ссылка — путь на сайте, например /cabinet.")
    .nullable(),
});

/** Разослать уведомление сегменту: колокольчик, Telegram, пуши. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "notifications.broadcast");
  const count = await sendBroadcast({ seasonId: await requireCurrentSeasonId(), ...body, body: body.body || null, url: body.url || null });
  await audit(event, { actorId: actor.id, action: "broadcast.send", meta: { segment: body.segment, title: body.title, count } });
  return { ok: true, message: count ? `Отправлено: ${count}.` : "В сегменте никого нет — никому не ушло." };
});
