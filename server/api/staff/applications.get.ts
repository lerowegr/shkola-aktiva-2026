import { z } from "zod";

import { EVALUATED_STAGES, listApplications } from "~~/lib/applications/staff";
import { can } from "~~/lib/permissions";
import { parseFacultyFilter } from "~~/lib/profile/faculty";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireUser } from "~~/server/utils/session";

const query = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
  filter: z.enum(["all", "todo", "done"]).default("all"),
  q: z.string().max(100).default(""),
  stage: z.enum(EVALUATED_STAGES).default("APPLICATION"),
  faculty: z.string().max(20).default(""),
});

/** «Мои / Все» на любом оцениваемом этапе: анкеты, ДЗ, собеседования. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const params = query.parse(getQuery(event));

  const needed = params.scope === "mine" ? "applications.review" : "applications.view_all";
  if (!can(user, needed)) {
    throw createError({ statusCode: 403, statusMessage: "Этот список вам недоступен." });
  }

  return listApplications({
    seasonId: await requireCurrentSeasonId(),
    viewerId: user.id,
    scope: params.scope,
    filter: params.filter,
    query: params.q,
    stage: params.stage,
    faculty: parseFacultyFilter(params.faculty),
  });
});
