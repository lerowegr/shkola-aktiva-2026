import type { db } from "~~/lib/db";
import { INTERVIEW_BREAK_MS } from "./rules";

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
    slot: { archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}), startsAt: { lt: new Date(+endsAt + INTERVIEW_BREAK_MS) }, endsAt: { gt: new Date(+startsAt - INTERVIEW_BREAK_MS) } },
  }, select: { id: true } });
  if (conflict) throw new InterviewScheduleError("У этого мастера уже есть собеседование в выбранное время или нет перерыва 5 минут. Выберите другое время или другого мастера.");
}
