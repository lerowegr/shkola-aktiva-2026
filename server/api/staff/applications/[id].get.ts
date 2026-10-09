import { z } from "zod";

import { EVALUATED_STAGES, loadStaffApplication, neighbours } from "~~/lib/applications/staff";
import { loadGuide } from "~~/lib/interviews/guide";
import { can } from "~~/lib/permissions";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

const query = z.object({
  from: z.enum(["mine", "all"]).default("mine"),
  stage: z.enum(EVALUATED_STAGES).default("APPLICATION"),
});

/**
 * Карточка анкеты для организатора.
 *
 * Открыть её может мастер, которому она назначена, или тот, кому можно
 * видеть все анкеты. Менять — только свою оценку: это решает сохранение,
 * а здесь только флаг для интерфейса.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const id = getRouterParam(event, "id") ?? "";
  const { from, stage } = query.parse(getQuery(event));

  const card = await loadStaffApplication(id, user.id, stage);
  if (!card) throw createError({ statusCode: 404, statusMessage: "Анкета не найдена." });
  if (stage === "HOMEWORK" && card.submissions.length === 0) {
    throw createError({ statusCode: 404, statusMessage: "Домашнее задание ещё не сдано." });
  }

  const assignedToMe = card.reviews.some((review) => review.isMine && !review.released);
  const mayReview = assignedToMe && can(user, "applications.review");

  if (!mayReview && !can(user, "applications.view_all")) {
    throw createError({ statusCode: 403, statusMessage: "Эта анкета вам недоступна." });
  }

  // Листаем тот список, из которого пришли; «мои» — только если анкета моя.
  const seasonId = await requireCurrentSeasonId();
  const scope = from === "mine" && assignedToMe ? "mine" : can(user, "applications.view_all") ? "all" : "mine";
  const around = await neighbours(seasonId, user.id, id, scope, stage);

  return {
    card,
    stage,
    canEdit: mayReview,
    canAssign: can(user, "applications.assign"),
    scope,
    guide: stage === "INTERVIEW" ? await loadGuide(seasonId, id, user.id) : [],
    ...around,
  };
});
