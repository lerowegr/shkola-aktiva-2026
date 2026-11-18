import { z } from "zod";

import { questionsSchema } from "~~/lib/participation/form";
import { inviteToParticipation } from "~~/lib/participation/store";
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
  questions: questionsSchema.optional(),
});

/** Разослать уведомление сегменту: колокольчик, Telegram, пуши. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "notifications.broadcast");
  const seasonId = await requireCurrentSeasonId();
  let count: number;
  if (body.segment === "sha_participation") {
    if (!body.questions) return { ok: false, message: "Проверьте формулировки вопросов анкеты." };
    count = await inviteToParticipation({ seasonId, title: body.title, body: body.body || null, questions: body.questions });
  } else {
    count = await sendBroadcast({ seasonId, ...body, body: body.body || null, url: body.url || null });
  }
  await audit(event, { actorId: actor.id, action: "broadcast.send", meta: { segment: body.segment, title: body.title, count } });
  return { ok: true, message: count ? `Поставлено в очередь: ${count}.` : "В сегменте никого нет — никому не ушло." };
});
