import { z } from "zod";

import { db } from "~~/lib/db";
import { loadGuideNotes } from "~~/lib/interviews/guide";
import { can } from "~~/lib/permissions";
import { requireUser } from "~~/server/utils/session";

const query = z.object({ applicationId: z.string().min(1) });

/**
 * Заметки сценария собеса — страница опрашивает их каждые пару секунд,
 * чтобы мастера видели, что пишет второй. Доступ — как у карточки:
 * назначенный мастер или тот, кому можно видеть все анкеты.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { applicationId } = query.parse(getQuery(event));

  if (!can(user, "applications.view_all")) {
    const assigned = can(user, "applications.review")
      ? await db.review.findFirst({ where: { applicationId, reviewerId: user.id, releasedAt: null }, select: { id: true } })
      : null;
    if (!assigned) throw createError({ statusCode: 403, statusMessage: "Эта анкета вам недоступна." });
  }
  return loadGuideNotes(applicationId, user.id);
});
