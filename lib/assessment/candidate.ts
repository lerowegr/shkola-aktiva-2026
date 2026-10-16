import { candidateDecision } from "~~/lib/applications/decisions";
import { db } from "~~/lib/db";
import { stageState, type StageState } from "~~/lib/stages";

import { readPlace, type Place } from "./rules";

/**
 * Центр оценки глазами кандидата: что это за этап и — после рассылки —
 * где и когда. Ни баллов, ни комментариев, ни «прошёл / не прошёл»: на ЦО
 * оценивают всех, а дальше кандидат просто ждёт следующего этапа. Этот файл
 * не читает оценки вовсе — так их точно не утащить в ответ.
 */
export interface CandidateAssessment {
  title: string;
  description: string | null;
  state: StageState;
  opensAt: Date | null;
  closesAt: Date | null;
  /** Снимок места из последней рассылки его группе. */
  place: Place | null;
  notifiedAt: Date | null;
}

export async function loadCandidateAssessment(userId: string): Promise<CandidateAssessment | null> {
  const application = await db.application.findFirst({
    where: { userId, status: "SUBMITTED", season: { isCurrent: true } },
    select: {
      season: {
        select: {
          stages: {
            where: { kind: "ASSESSMENT" },
            select: { title: true, description: true, mode: true, opensAt: true, closesAt: true },
          },
        },
      },
      assessment: { select: { group: { select: { notified: true, notifiedAt: true } } } },
    },
  });
  const stage = application?.season.stages[0];
  if (!application || !stage) return null;

  // ЦО — для прошедших анкету и до решения о собеседовании: не прошедшему
  // анкету и тем, кто уже идёт дальше, карточка ни к чему.
  const season = await db.season.findFirstOrThrow({ where: { isCurrent: true }, select: { id: true } });
  const [admission, next] = await Promise.all([
    candidateDecision(userId, season.id, "APPLICATION"),
    candidateDecision(userId, season.id, "HOMEWORK"),
  ]);
  if (admission !== "PASSED" || next !== null) return null;

  const group = application.assessment?.group ?? null;
  return {
    title: stage.title,
    description: stage.description?.trim() || null,
    state: stageState(stage),
    opensAt: stage.opensAt,
    closesAt: stage.closesAt,
    place: group?.notifiedAt ? readPlace(group.notified) : null,
    notifiedAt: group?.notifiedAt ?? null,
  };
}
