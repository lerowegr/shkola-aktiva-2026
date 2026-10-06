-- Профиль для рейтинга: никнейм, аватарка, порядковый номер регистрации.
ALTER TABLE "users" ADD COLUMN "nickname" TEXT,
  ADD COLUMN "nicknameNorm" TEXT,
  ADD COLUMN "nicknameChangedAt" TIMESTAMP(3),
  ADD COLUMN "avatarKey" TEXT,
  ADD COLUMN "seq" INTEGER;

CREATE UNIQUE INDEX "users_nicknameNorm_key" ON "users"("nicknameNorm");
CREATE UNIQUE INDEX "users_seq_key" ON "users"("seq");

-- Нумерация существующих по дате регистрации, а не по порядку в таблице.
-- В два прохода через отрицательные: однопроходной UPDATE конфликтует
-- сам с собой на уникальном индексе.
UPDATE "users" SET "seq" = -"seq";
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n FROM "users"
)
UPDATE "users" SET "seq" = numbered.n FROM numbered WHERE "users".id = numbered.id;

-- Новым — из последовательности, начиная с максимума.
CREATE SEQUENCE users_seq_seq;
SELECT setval('users_seq_seq', (SELECT COALESCE(MAX("seq"), 0) FROM "users"));
ALTER TABLE "users" ALTER COLUMN "seq" SET DEFAULT nextval('users_seq_seq');
ALTER TABLE "users" ALTER COLUMN "seq" SET NOT NULL;
