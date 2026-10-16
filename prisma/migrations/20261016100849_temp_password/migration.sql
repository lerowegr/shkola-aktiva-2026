-- «Забыли пароль?»: временный пароль из бота на 24 часа и обязательная смена.
ALTER TABLE "users" ADD COLUMN "tempPasswordHash" TEXT,
ADD COLUMN "tempPasswordExpiresAt" TIMESTAMP(3),
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
