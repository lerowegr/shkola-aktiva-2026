import { z } from "zod";

import { listThreads } from "~~/lib/messages/threads";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const query = z.object({ q: z.string().max(100).default("") });

/** Ветки переписки — левая колонка вкладки «Сообщения». */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "messages.reply");
  const { q } = query.parse(getQuery(event));
  return listThreads(await requireCurrentSeasonId(), q);
});
