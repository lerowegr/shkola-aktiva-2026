import { schedule } from "~~/lib/interviews/slots";
import { can, canAny } from "~~/lib/permissions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

/** Расписание собеседований для организаторов. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  if (!canAny(user, ["applications.review", "applications.view_all", "interviews.manage"])) {
    throw createError({ statusCode: 403, statusMessage: "Расписание вам недоступно." });
  }
  const archived = getQuery(event).archived === "1";
  if (archived && !can(user, "interviews.manage")) throw createError({ statusCode: 403, statusMessage: "Снятые слоты доступны управляющему." });
  return { slots: await schedule(await requireCurrentSeasonId(), user.id, archived) };
});
