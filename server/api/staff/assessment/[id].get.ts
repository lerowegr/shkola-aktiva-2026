import { loadSheet } from "~~/lib/assessment/sheet";
import { db } from "~~/lib/db";
import { can } from "~~/lib/permissions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

/** Экран группы: эксперту группы — для оценки, распределяющим и «все анкеты» — для просмотра. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const seasonId = await requireCurrentSeasonId();
  const id = getRouterParam(event, "id") ?? "";

  const expert = await db.assessmentExpert.findFirst({ where: { groupId: id, userId: user.id }, select: { userId: true } });
  const viewer = can(user, "applications.assign") || can(user, "applications.view_all");
  if (!(expert && can(user, "applications.review")) && !viewer) {
    throw createError({ statusCode: 403, statusMessage: "Эта группа не ваша — её оценивают другие эксперты." });
  }

  const sheet = await loadSheet(seasonId, id, user.id);
  if (!sheet) throw createError({ statusCode: 404, statusMessage: "Группа не найдена." });
  return { sheet, isExpert: Boolean(expert), manage: can(user, "applications.assign") };
});
