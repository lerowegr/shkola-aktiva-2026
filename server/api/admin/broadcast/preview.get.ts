import { z } from "zod";

import { SEGMENTS, segmentUserIds, type Segment } from "~~/lib/admin/broadcast";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const query = z.object({ segment: z.enum(Object.keys(SEGMENTS) as [Segment, ...Segment[]]) });

/** Сколько человек получат рассылку — до отправки. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "notifications.broadcast");
  const { segment } = query.parse(getQuery(event));
  return { count: (await segmentUserIds(await requireCurrentSeasonId(), segment)).length };
});
