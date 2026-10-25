import { z } from "zod";

import { loadNotes, noteAccess } from "~~/lib/assessment/notes";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

const query = z.object({ groupId: z.string().min(1) });

/** Комментарии к заданиям и фон подгруппы — экран опрашивает их каждые пару секунд. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { groupId } = query.parse(getQuery(event));
  const access = await noteAccess(user, groupId);
  if (!access.read) throw createError({ statusCode: 403, statusMessage: "Эта подгруппа не ваша." });
  const notes = await loadNotes(await requireCurrentSeasonId(), groupId, user.id);
  if (!notes) throw createError({ statusCode: 404, statusMessage: "Подгруппа не найдена." });
  return notes;
});
