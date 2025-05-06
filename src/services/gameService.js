import { PrismaClient } from '@prisma/client';
import { isValidEnglishWord, getPossibleWords } from '../utils/wordValidator.js';
import { GAME_DURATION_SECONDS } from '../config/gameConfig.js';
import { updateDailyLoginStreak } from './streakService.js';

const prisma = new PrismaClient();

export async function createGame(player1Id, player2Id) {
  return prisma.game.create({
    data: {
      player1Id,
      player2Id,
      status: 'ACTIVE',
      currentTurn: player1Id,
      letters: generateRandomLetters(7),
      player1Score: 0,
      player2Score: 0,
      player1Words: [],
      player2Words: []
    }
  });
}

export async function submitWord(gameId, userId, word) {
  const game = await prisma.game.findUnique({
    where: { id: gameId }
  });

  if (!game) {
    throw new Error('Game not found');
  }

  if (game.status !== 'ACTIVE') {
    throw new Error('Game is not active');
  }

  if (game.currentTurn !== userId) {
    throw new Error('Not your turn');
  }

  // Check if word is valid
  if (!isValidEnglishWord(word, 'sowpods')) {
    throw new Error('Invalid word');
  }

  // Check if word has already been used
  const allWords = [...game.player1Words, ...game.player2Words];
  if (allWords.includes(word.toLowerCase())) {
    throw new Error('Word already used');
  }

  // Calculate score
  const score = calculateWordScore(word);

  // Update game state
  const isPlayer1 = game.player1Id === userId;
  const updateData = {
    player1Words: isPlayer1 ? [...game.player1Words, word.toLowerCase()] : game.player1Words,
    player2Words: !isPlayer1 ? [...game.player2Words, word.toLowerCase()] : game.player2Words,
    player1Score: isPlayer1 ? game.player1Score + score : game.player1Score,
    player2Score: !isPlayer1 ? game.player2Score + score : game.player2Score,
    currentTurn: isPlayer1 ? game.player2Id : game.player1Id
  };

  // Check if game is over (no more possible words)
  const possibleWords = getPossibleWords(game.letters, 'sowpods');
  const remainingWords = possibleWords.filter(w => !allWords.includes(w));

  if (remainingWords.length === 0) {
    updateData.status = 'COMPLETED';
    updateData.winnerId = updateData.player1Score > updateData.player2Score ? game.player1Id : game.player2Id;
  }

  return prisma.game.update({
    where: { id: gameId },
    data: updateData
  });
}

export async function getGameState(gameId) {
  const game = await prisma.game.findUnique({
    where: { id: gameId }
  });

  if (!game) {
    throw new Error('Game not found');
  }

  // Get possible words count
  const possibleWords = getPossibleWords(game.letters, 'sowpods');
  const allWords = [...game.player1Words, ...game.player2Words];
  const remainingWords = possibleWords.filter(w => !allWords.includes(w));

  return {
    ...game,
    possibleWordsCount: remainingWords.length
  };
}

// Helper function to generate random letters
function generateRandomLetters(length = 7) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

// Helper function to calculate word score
function calculateWordScore(word) {
  return word.length; // Basic scoring: 1 point per letter
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
