import { z } from "zod";

import { setSlotInterviewers } from "~~/lib/interviews/booking";
import { interviewPlace } from "~~/lib/interviews/rules";
import { notify } from "~~/lib/notifications/notify";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  slotId: z.string().min(1),
  interviewerIds: z.array(z.string().min(1)).length(1, "Выберите ровно одного мастера."),
  startsAt: z.iso.datetime().optional(),
});

const when = (date: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);

/** Передать слот другому мастеру, при необходимости сдвинув время. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  const result = await setSlotInterviewers(body.slotId, body.interviewerIds, body.startsAt ? new Date(body.startsAt) : undefined);
  if (!result.ok) return result;
  if (!result.added.length && !result.removed.length && !result.timeChanged) return { ok: true, message: "Мастер и время не изменились." };
  await audit(event, {
    actorId: actor.id,
    action: "interview.slot_interviewers",
    entityType: "slot",
    entityId: body.slotId,
    meta: { added: result.added, removed: result.removed, before: result.oldStartsAt, after: result.startsAt, applicationIds: result.bookings.map(b => b.applicationId) },
  });
  const place = interviewPlace(result);
  const candidate = result.bookings.map(b => b.name).join(", ") || "Свободный слот";
  const masterIds = new Set([...result.added, ...(result.timeChanged ? body.interviewerIds : [])]);
  await notify([
    ...[...masterIds].map(userId => ({ userId, category: "SYSTEM" as const, title: result.added.includes(userId) ? "Вам передано собеседование" : "Изменилось время собеседования", body: `${candidate}. ${when(result.startsAt)}, ${place}.`, url: "/staff/interviews" })),
    ...result.removed.map(userId => ({ userId, category: "SYSTEM" as const, title: "Собеседование передано другому мастеру", body: `${candidate}. Было: ${when(result.oldStartsAt)}, ${place}.`, url: "/staff/interviews" })),
    ...(result.timeChanged ? result.bookings.map(b => ({ userId: b.userId, category: "SELECTION" as const, title: "Изменилось время собеседования", body: `Новое время: ${when(result.startsAt)}, ${place}. Время московское. Право на самостоятельную перезапись не израсходовано.`, url: "/cabinet/interview" })) : []),
  ], { urgent: true });
  return { ok: true, message: result.timeChanged ? "Время обновлено. Участник и мастера при наличии записи уведомлены." : "Слот передан. Мастера уведомлены." };
});
