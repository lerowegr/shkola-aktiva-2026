-- CreateEnum
CREATE TYPE "AssessmentAnswer" AS ENUM ('GOING', 'RESERVE', 'CANT');

-- AlterTable
ALTER TABLE "assessment_groups" DROP COLUMN "capacity",
DROP COLUMN "faculties",
ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "review_scores" ADD COLUMN     "comment" TEXT;

-- CreateTable
CREATE TABLE "assessment_sessions" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "building" TEXT,
    "room" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "faculties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reserve" BOOLEAN NOT NULL DEFAULT false,
    "invited" JSONB,
    "invitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_invites" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer" "AssessmentAnswer",
    "answeredAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "attended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assessment_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_tasks" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assessment_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_task_notes" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_task_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_group_notes" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_group_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_sessions_seasonId_startsAt_idx" ON "assessment_sessions"("seasonId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_invites_applicationId_key" ON "assessment_invites"("applicationId");

-- CreateIndex
CREATE INDEX "assessment_invites_sessionId_idx" ON "assessment_invites"("sessionId");

-- CreateIndex
CREATE INDEX "assessment_tasks_seasonId_order_idx" ON "assessment_tasks"("seasonId", "order");

-- CreateIndex
CREATE INDEX "assessment_task_notes_applicationId_idx" ON "assessment_task_notes"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_task_notes_taskId_applicationId_authorId_key" ON "assessment_task_notes"("taskId", "applicationId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_group_notes_groupId_authorId_key" ON "assessment_group_notes"("groupId", "authorId");

-- AddForeignKey
ALTER TABLE "assessment_groups" ADD CONSTRAINT "assessment_groups_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invites" ADD CONSTRAINT "assessment_invites_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_invites" ADD CONSTRAINT "assessment_invites_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_tasks" ADD CONSTRAINT "assessment_tasks_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_task_notes" ADD CONSTRAINT "assessment_task_notes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "assessment_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_task_notes" ADD CONSTRAINT "assessment_task_notes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_task_notes" ADD CONSTRAINT "assessment_task_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_group_notes" ADD CONSTRAINT "assessment_group_notes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "assessment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_group_notes" ADD CONSTRAINT "assessment_group_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

