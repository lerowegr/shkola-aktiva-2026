import { z } from "zod";

import { createSlots, cutSlots } from "~~/lib/interviews/slots";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const time = z.string().regex(/^\d{2}:\d{2}$/, "Время в виде 10:00.");

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Выберите дату."),
  from: time,
  to: time,
  duration: z.number().int().min(5, "Собеседование не короче 5 минут.").max(240),
  gap: z.number().int().min(0).max(120),
  capacity: z.number().int().min(1).max(20),
  location: z.string().trim().min(1, "Укажите место или ссылку на звонок.").max(300),
  interviewerIds: z.array(z.string().min(1)).min(1, "Выберите хотя бы одного собеседующего.").max(10),
});

/** Нарезать слоты на день: с–по, длительность, перерыв. Время — московское. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "interviews.manage");
  const slots = cutSlots(body);
  if (slots.length === 0) return { ok: false, message: "Слотов не получилось — проверьте время начала, конца и длительность." };
  if (slots[0]!.startsAt.getTime() < Date.now()) {
    return { ok: false, message: "Это время уже прошло — выберите будущий день или более позднее начало." };
  }

  await createSlots({
    seasonId: await requireCurrentSeasonId(),
    slots,
    location: body.location,
    capacity: body.capacity,
    interviewerIds: body.interviewerIds,
    createdById: actor.id,
  });

  await audit(event, { actorId: actor.id, action: "interview.slots_create", meta: { date: body.date, count: slots.length } });
  return { ok: true, message: `Создано слотов: ${slots.length}.` };
});
