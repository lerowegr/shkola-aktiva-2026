-- AlterTable
ALTER TABLE "users" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "course" TEXT,
ADD COLUMN     "faculty" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "studentId" TEXT;
