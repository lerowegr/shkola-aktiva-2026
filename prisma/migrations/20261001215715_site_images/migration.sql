-- CreateTable
CREATE TABLE "site_images" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_images_storageKey_key" ON "site_images"("storageKey");

-- CreateIndex
CREATE INDEX "site_images_seasonId_idx" ON "site_images"("seasonId");

-- AddForeignKey
ALTER TABLE "site_images" ADD CONSTRAINT "site_images_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
