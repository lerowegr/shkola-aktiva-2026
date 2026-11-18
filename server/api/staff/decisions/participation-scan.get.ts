import { db } from "~~/lib/db";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "applications.decide");
  const seasonId = await requireCurrentSeasonId();
  const { applicationId } = getQuery(event);
  if (typeof applicationId !== "string") throw createError({ statusCode: 400, statusMessage: "Укажите анкету." });
  const scan = await db.participation.findFirst({
    where: { applicationId, application: { seasonId }, submittedAt: { not: null } },
    select: { consentScan: true, scanMime: true },
  });
  if (!scan?.consentScan || !scan.scanMime) throw createError({ statusCode: 404, statusMessage: "Заявление не найдено." });
  const extensions: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
  await audit(event, { actorId: actor.id, action: "participation.scan.download", entityType: "application", entityId: applicationId });
  setHeader(event, "Content-Type", scan.scanMime);
  setHeader(event, "Content-Disposition", `attachment; filename="parent-consent.${extensions[scan.scanMime] ?? "bin"}"`);
  setHeader(event, "Cache-Control", "private, no-store");
  setHeader(event, "X-Content-Type-Options", "nosniff");
  return Buffer.from(scan.consentScan);
});
