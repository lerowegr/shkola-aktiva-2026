-- CreateEnum
CREATE TYPE "GameKind" AS ENUM ('MEMORY', 'SLIDE', 'CATCH');

-- CreateTable
CREATE TABLE "game_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "GameKind" NOT NULL,
    "score" INTEGER NOT NULL,
    "moves" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_results_game_userId_idx" ON "game_results"("game", "userId");

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
