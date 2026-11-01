import type { db } from "~~/lib/db";

export type InterviewTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class InterviewScheduleError extends Error {}

export async function validateInterviewer(tx: InterviewTx, userId: string): Promise<void> {
  const valid = await tx.user.count({ where: {
    id: userId, status: "ACTIVE",
    OR: [{ isOwner: true }, { roles: { some: { role: { permissions: { hasSome: ["applications.review", "interviews.manage"] } } } } }],
  } });
  if (!valid) throw new InterviewScheduleError("Выберите действующего мастера отбора или ведущего собеседований.");
}

export async function checkOverlap(tx: InterviewTx, userId: string, startsAt: Date, endsAt: Date, exceptId?: string): Promise<void> {
  const conflict = await tx.slotInterviewer.findFirst({ where: {
    userId,
    slot: { ...(exceptId ? { id: { not: exceptId } } : {}), startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  }, select: { id: true } });
  if (conflict) throw new InterviewScheduleError("У этого мастера уже есть собеседование в выбранное время. Выберите другое время или другого мастера.");
}
