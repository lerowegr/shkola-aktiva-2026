-- CreateTable
CREATE TABLE "interview_slots" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_interviewers" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "slot_interviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_bookings" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "interview_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_slots_seasonId_startsAt_idx" ON "interview_slots"("seasonId", "startsAt");

-- CreateIndex
CREATE INDEX "slot_interviewers_userId_idx" ON "slot_interviewers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "slot_interviewers_slotId_userId_key" ON "slot_interviewers"("slotId", "userId");

-- CreateIndex
CREATE INDEX "interview_bookings_slotId_cancelledAt_idx" ON "interview_bookings"("slotId", "cancelledAt");

-- CreateIndex
CREATE INDEX "interview_bookings_applicationId_cancelledAt_idx" ON "interview_bookings"("applicationId", "cancelledAt");

-- AddForeignKey
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_interviewers" ADD CONSTRAINT "slot_interviewers_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "interview_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_interviewers" ADD CONSTRAINT "slot_interviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_bookings" ADD CONSTRAINT "interview_bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "interview_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_bookings" ADD CONSTRAINT "interview_bookings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
