-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'URL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable
CREATE TABLE "form_questions" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "stageKind" "StageKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "help" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" TEXT[],
    "maxLength" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "lastName" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "studentId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "stageKind" "StageKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "badge" TEXT,
    "maxScore" INTEGER NOT NULL,
    "levels" JSONB NOT NULL,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markers" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "stageKind" "StageKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "example" TEXT,

    CONSTRAINT "markers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageKind" "StageKind" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "comment" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_scores" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "review_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_markers" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "review_markers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_questions_seasonId_stageKind_order_idx" ON "form_questions"("seasonId", "stageKind", "order");

-- CreateIndex
CREATE INDEX "applications_seasonId_status_idx" ON "applications"("seasonId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_seasonId_userId_key" ON "applications"("seasonId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "answers_applicationId_questionId_key" ON "answers"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "criteria_seasonId_stageKind_order_idx" ON "criteria"("seasonId", "stageKind", "order");

-- CreateIndex
CREATE INDEX "markers_seasonId_stageKind_order_idx" ON "markers"("seasonId", "stageKind", "order");

-- CreateIndex
CREATE INDEX "reviews_reviewerId_stageKind_idx" ON "reviews"("reviewerId", "stageKind");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_applicationId_stageKind_reviewerId_key" ON "reviews"("applicationId", "stageKind", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "review_scores_reviewId_criterionId_key" ON "review_scores"("reviewId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "review_markers_reviewId_markerId_key" ON "review_markers"("reviewId", "markerId");

-- AddForeignKey
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "form_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markers" ADD CONSTRAINT "markers_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_scores" ADD CONSTRAINT "review_scores_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_scores" ADD CONSTRAINT "review_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_markers" ADD CONSTRAINT "review_markers_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_markers" ADD CONSTRAINT "review_markers_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "markers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
