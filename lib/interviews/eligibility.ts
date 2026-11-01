import type { InterviewTx } from "./scheduling";

export const ASSESSMENT_REQUIRED = "Запись на собеседование доступна после прохождения центра оценки. Если вы были на ЦО, обратитесь к организаторам, чтобы они проверили отметку явки.";

/** Блокировка строки синхронизирует запись с изменением отметки явки. */
export async function hasAssessmentAttendance(tx: InterviewTx, applicationId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ attended: boolean }[]>`SELECT attended FROM assessment_invites WHERE "applicationId" = ${applicationId} FOR UPDATE`;
  return rows[0]?.attended === true;
}
