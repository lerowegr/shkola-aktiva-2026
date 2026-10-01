-- CreateTable
CREATE TABLE "site_contents" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "site_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_contents_seasonId_key" ON "site_contents"("seasonId");

-- AddForeignKey
ALTER TABLE "site_contents" ADD CONSTRAINT "site_contents_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
