ALTER TABLE "applications" ADD COLUMN "interviewReschedulesUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "interview_slots" ADD COLUMN "room" TEXT;
-- До появления ручного управления переносы кандидата сохранялись в истории записей.
UPDATE "applications" a SET "interviewReschedulesUsed" = history.used
FROM (SELECT "applicationId", GREATEST(COUNT(*)::int - 1, 0) AS used FROM "interview_bookings" GROUP BY "applicationId") history
WHERE a.id = history."applicationId";
