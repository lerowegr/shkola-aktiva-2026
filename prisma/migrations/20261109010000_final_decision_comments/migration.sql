CREATE TABLE "final_decision_comments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" VARCHAR(1200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "final_decision_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "final_decision_comments_applicationId_createdAt_idx" ON "final_decision_comments"("applicationId", "createdAt");

ALTER TABLE "final_decision_comments" ADD CONSTRAINT "final_decision_comments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "final_decision_comments" ADD CONSTRAINT "final_decision_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
