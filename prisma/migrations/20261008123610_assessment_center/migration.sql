-- AlterEnum
ALTER TYPE "StageKind" ADD VALUE 'ASSESSMENT' BEFORE 'INTERVIEW';

-- AlterTable
ALTER TABLE "criteria" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "assessment_groups" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "building" TEXT,
    "room" TEXT,
    "startsAt" TIMESTAMP(3),
    "note" TEXT,
    "notified" JSONB,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_experts" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "assessment_experts_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateIndex
CREATE INDEX "assessment_groups_seasonId_idx" ON "assessment_groups"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_members_applicationId_key" ON "assessment_members"("applicationId");

-- CreateIndex
CREATE INDEX "assessment_members_groupId_idx" ON "assessment_members"("groupId");

-- AddForeignKey
ALTER TABLE "assessment_groups" ADD CONSTRAINT "assessment_groups_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_members" ADD CONSTRAINT "assessment_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "assessment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_members" ADD CONSTRAINT "assessment_members_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_experts" ADD CONSTRAINT "assessment_experts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "assessment_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_experts" ADD CONSTRAINT "assessment_experts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
