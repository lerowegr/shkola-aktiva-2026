import { displayName } from "~~/lib/auth/actor";
import { loadSessionPage } from "~~/lib/assessment/sessions";
import { db } from "~~/lib/db";
import { can } from "~~/lib/permissions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

/**
 * Страница сбора: ответы, подгруппы с людьми (отбивка), нераспределённые.
 * Для распределяющих и тех, кому можно видеть все анкеты.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const manage = can(user, "applications.assign");
  if (!manage && !can(user, "applications.view_all")) {
    throw createError({ statusCode: 403, statusMessage: "Страница сбора — для распределяющих. Ваши подгруппы — в «Центре оценки»." });
  }
  const seasonId = await requireCurrentSeasonId();
  const page = await loadSessionPage(seasonId, getRouterParam(event, "id") ?? "", manage);
  if (!page) throw createError({ statusCode: 404, statusMessage: "Сбор не найден." });

  const experts = manage
    ? (
        await db.user.findMany({
          where: { status: "ACTIVE", roles: { some: { role: { permissions: { has: "applications.review" } } } } },
          select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true },
        })
      )
        .map((person) => ({ id: person.id, name: displayName(person) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    : [];
  return { manage, page, experts };
});
