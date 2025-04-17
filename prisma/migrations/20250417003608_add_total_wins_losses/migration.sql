/*
  Warnings:

  - You are about to drop the column `submittedAt` on the `WordSubmission` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gameId,userId,word]` on the table `WordSubmission` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totalLosses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalWins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "winStreak" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WordSubmission" DROP COLUMN "submittedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "WordSubmission_gameId_userId_word_key" ON "WordSubmission"("gameId", "userId", "word");
