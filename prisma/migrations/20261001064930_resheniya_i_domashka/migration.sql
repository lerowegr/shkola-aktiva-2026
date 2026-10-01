-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('PASSED', 'REJECTED');

-- AlterTable
ALTER TABLE "stages" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "stage_decisions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageKind" "StageKind" NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "stage_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageKind" "StageKind" NOT NULL,
    "uploadId" TEXT,
    "text" TEXT,
    "via" "MessageVia" NOT NULL DEFAULT 'SITE',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedAt" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stage_decisions_stageKind_publishedAt_idx" ON "stage_decisions"("stageKind", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "stage_decisions_applicationId_stageKind_key" ON "stage_decisions"("applicationId", "stageKind");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_storageKey_key" ON "uploads"("storageKey");

-- CreateIndex
CREATE INDEX "uploads_userId_idx" ON "uploads"("userId");

-- CreateIndex
CREATE INDEX "submissions_applicationId_stageKind_replacedAt_idx" ON "submissions"("applicationId", "stageKind", "replacedAt");

-- AddForeignKey
ALTER TABLE "stage_decisions" ADD CONSTRAINT "stage_decisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_decisions" ADD CONSTRAINT "stage_decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
