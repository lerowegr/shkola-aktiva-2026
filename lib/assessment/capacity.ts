import type { db } from "~~/lib/db";

export type AssessmentTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Один замок на сезон для рассылки, автоприглашений, лимитов и переходов в резерв. */
export async function lockAssessmentCapacity(
  tx: AssessmentTx,
  seasonId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assessment-capacity:${seasonId}`}))`;
}

/** В резерве учитываем также перешедших с других сборов, без двойного подсчёта. */
export async function usedAssessmentPlaces(
  tx: AssessmentTx,
  session: { id: string; seasonId: string; reserve: boolean },
) {
  return tx.assessmentInvite.count({
    where: {
      OR: [
        { sessionId: session.id },
        ...(session.reserve
          ? [
              {
                sessionId: { not: session.id },
                answer: "RESERVE" as const,
                reserveQueued: false,
                session: { seasonId: session.seasonId },
              },
            ]
          : []),
      ],
    },
  });
}
