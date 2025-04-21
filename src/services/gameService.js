
import { PrismaClient } from '@prisma/client';
import { GAME_DURATION_SECONDS } from '../config/gameConfig.js';
import { updateDailyLoginStreak } from './streakService.js';

const prisma = new PrismaClient();

export async function createGame(playerOneId, playerTwoId, letters) {
  const endsAt = new Date(Date.now() + GAME_DURATION_SECONDS * 1000);

  await Promise.all([
    updateDailyLoginStreak(playerOneId),
    updateDailyLoginStreak(playerTwoId)
  ]);

  return prisma.game.create({
    data: {
      playerOneId,
      playerTwoId,
      letters,
      status: 'ACTIVE',
      endsAt
    }
  });
}

export async function finalizeGame(gameId) {
  const submissions = await prisma.wordSubmission.findMany({
    where: { gameId }
  });

  const scores = {};
  for (const sub of submissions) {
    scores[sub.userId] = (scores[sub.userId] || 0) + sub.score;
  }

  const userIds = Object.keys(scores);
  let winnerId = null;

  if (userIds.length === 2) {
    const [userA, userB] = userIds;
    winnerId =
      scores[userA] > scores[userB] ? userA :
      scores[userB] > scores[userA] ? userB :
      null;
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { playerOneId: true, playerTwoId: true, endsAt: true }
  });

  const endsAt = game.endsAt || new Date();

  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: 'FINISHED',
      winnerId,
      endsAt
    }
  });

  if (winnerId && game.playerOneId && game.playerTwoId) {
    const loserId = winnerId === game.playerOneId ? game.playerTwoId : game.playerOneId;

    await Promise.all([
      prisma.user.update({
        where: { id: winnerId },
        data: {
          winStreak: { increment: 1 },
          totalWins: { increment: 1 }
        }
      }),
      prisma.user.update({
        where: { id: loserId },
        data: {
          winStreak: 0,
          totalLosses: { increment: 1 }
        }
      })
    ]);
  }

  return { scores, winnerId };
}
