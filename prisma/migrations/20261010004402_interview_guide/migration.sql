-- Сценарий собеседования: вопросы по блокам + ячейки комментариев мастеров.
CREATE TABLE "interview_questions" (
  "id" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "block" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "intro" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_notes" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "interview_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "interview_questions_seasonId_order_idx" ON "interview_questions"("seasonId", "order");
CREATE UNIQUE INDEX "interview_notes_applicationId_questionId_authorId_key" ON "interview_notes"("applicationId", "questionId", "authorId");

ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_notes" ADD CONSTRAINT "interview_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
