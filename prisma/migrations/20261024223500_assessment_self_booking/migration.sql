ALTER TABLE "assessment_groups" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "assessment_groups" ADD COLUMN "faculties" TEXT[] DEFAULT ARRAY[]::TEXT[];
