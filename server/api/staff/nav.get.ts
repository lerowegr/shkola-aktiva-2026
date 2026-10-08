import { db } from "~~/lib/db";
import { can } from "~~/lib/permissions";
import { listThreads } from "~~/lib/messages/threads";
import { currentSeason } from "~~/lib/stages";
import { requireUser } from "~~/server/utils/session";

/**
 * Что нужно шапке кабинета организатора: какие вкладки показать, какие под
 * замком и сколько анкет ждёт проверки.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  if (!user.isStaff) throw createError({ statusCode: 403, statusMessage: "Кабинет только для организаторов." });

  const season = await currentSeason();

  // Сколько назначенного мне ещё не проверено полностью на этапе.
  async function todoFor(stageKind: "APPLICATION" | "HOMEWORK" | "ASSESSMENT") {
    if (!season || !can(user, "applications.review")) return 0;
    const [mine, criteria] = await Promise.all([
      db.review.findMany({
        where: {
          reviewerId: user.id,
          stageKind,
          application: {
            seasonId: season!.id,
            status: "SUBMITTED",
            ...(stageKind === "HOMEWORK" ? { submissions: { some: { stageKind, replacedAt: null } } } : {}),
            // На ЦО — только кандидаты групп, где я эксперт: перенесённых не считаем.
            ...(stageKind === "ASSESSMENT" ? { assessment: { group: { experts: { some: { userId: user.id } } } } } : {}),
          },
        },
        select: { _count: { select: { scores: true } } },
      }),
      db.criterion.count({ where: { seasonId: season!.id, stageKind } }),
    ]);
    return mine.filter((review) => review._count.scores < criteria).length;
  }

  const [todo, homeworkTodo, assessmentTodo] = await Promise.all([
    todoFor("APPLICATION"),
    todoFor("HOMEWORK"),
    todoFor("ASSESSMENT"),
  ]);

  const messages =
    season && can(user, "messages.reply") ? (await listThreads(season.id)).unread : 0;

  const state = (kind: string) => season?.stages.find((stage) => stage.kind === kind)?.state ?? "upcoming";

  return {
    todo,
    homeworkTodo,
    assessmentTodo,
    messages,
    stages: {
      APPLICATION: state("APPLICATION"),
      HOMEWORK: state("HOMEWORK"),
      ASSESSMENT: state("ASSESSMENT"),
      INTERVIEW: state("INTERVIEW"),
    },
    can: {
      review: can(user, "applications.review"),
      viewAll: can(user, "applications.view_all"),
      assign: can(user, "applications.assign"),
      stages: can(user, "stages.manage"),
      messages: can(user, "messages.reply"),
      decide: can(user, "applications.decide"),
      interviews: can(user, "interviews.manage"),
      dashboards: can(user, "dashboards.view"),
      roles: can(user, "roles.manage"),
      forms: can(user, "forms.manage"),
      broadcast: can(user, "notifications.broadcast"),
      audit: can(user, "audit.view"),
      team: can(user, "users.manage"),
      content: can(user, "content.manage"),
    },
  };
});
