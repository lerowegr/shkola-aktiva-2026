CREATE TABLE "participation" (
    "applicationId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questions" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "attending" BOOLEAN,
    "answers" JSONB,
    "consentScan" BYTEA,
    "scanMime" TEXT,

    CONSTRAINT "participation_pkey" PRIMARY KEY ("applicationId"),
    CONSTRAINT "participation_applicationId_fkey" FOREIGN KEY ("applicationId")
      REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "participation_submittedAt_idx" ON "participation"("submittedAt");
