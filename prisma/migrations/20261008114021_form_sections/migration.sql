-- CreateEnum
CREATE TYPE "QuestionFormat" AS ENUM ('DIGITS', 'GROUP', 'PHONE', 'VK', 'TELEGRAM');

-- AlterTable
ALTER TABLE "form_questions" ADD COLUMN     "format" "QuestionFormat",
ADD COLUMN     "minLength" INTEGER;

-- CreateTable
CREATE TABLE "form_sections" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "stageKind" "StageKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_sections_seasonId_stageKind_order_idx" ON "form_sections"("seasonId", "stageKind", "order");

-- CreateIndex
CREATE UNIQUE INDEX "form_sections_seasonId_stageKind_title_key" ON "form_sections"("seasonId", "stageKind", "title");

-- AddForeignKey
ALTER TABLE "form_sections" ADD CONSTRAINT "form_sections_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Существующие разделы: из названий у вопросов, порядок — по первому вопросу раздела.
INSERT INTO "form_sections" ("id", "seasonId", "stageKind", "order", "title", "createdAt", "updatedAt")
SELECT 'sec_' || md5("seasonId" || "stageKind"::text || "section"),
       "seasonId", "stageKind",
       ROW_NUMBER() OVER (PARTITION BY "seasonId", "stageKind" ORDER BY MIN("order")),
       "section", NOW(), NOW()
FROM "form_questions"
GROUP BY "seasonId", "stageKind", "section";

-- Развёрнутым ответам — «подробно, от 200 знаков», как в анкете ША'26.
UPDATE "form_questions" SET "minLength" = 200 WHERE "type" = 'LONG_TEXT' AND "required" = true;
