-- Биржа оценок: возврат с сохранением замораживает строку.
ALTER TABLE "reviews" ADD COLUMN "releasedAt" TIMESTAMP(3);
