-- AlterTable
ALTER TABLE "assessment_groups" ADD COLUMN     "faculty" TEXT;

-- AlterTable
ALTER TABLE "assessment_invites" ADD COLUMN     "invitedDay" TEXT,
ADD COLUMN     "invitedFaculty" TEXT,
ADD COLUMN     "reserveOffered" BOOLEAN NOT NULL DEFAULT false;

-- Сохраняем день/факультет всех действующих приглашений, не меняя их время,
-- ответ, подгруппу, оценки и историю уведомлений.
UPDATE "assessment_invites" i
SET "invitedDay" = to_char((s."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD'),
    "invitedFaculty" = u.faculty
FROM "assessment_sessions" s, "applications" a, "users" u
WHERE i."sessionId" = s.id AND i."applicationId" = a.id AND a."userId" = u.id;
