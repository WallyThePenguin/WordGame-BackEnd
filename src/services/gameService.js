import { PrismaClient } from '@prisma/client';
import { isValidEnglishWord, getPossibleWords } from '../utils/wordValidator.js';
import { GAME_DURATION_SECONDS, MIN_POSSIBLE_WORDS } from '../config/gameConfig.js';
import { updateDailyLoginStreak } from './streakService.js';

const prisma = new PrismaClient();

export async function createGame(player1Id, player2Id, letters) {
  // Calculate end time based on game duration
  const endsAt = new Date(Date.now() + GAME_DURATION_SECONDS * 1000);

  console.log(`🕒 Creating game with duration ${GAME_DURATION_SECONDS} seconds, ending at ${endsAt.toISOString()}`);

  // If letters are not provided, generate random letters with enough possible words
  let gameLetters = letters;
  if (!gameLetters) {
    gameLetters = generateLettersWithMinWords(7, MIN_POSSIBLE_WORDS);
    console.log(`🎲 Generated letters ${gameLetters} with at least ${MIN_POSSIBLE_WORDS} possible words`);
  }

  return prisma.game.create({
    data: {
      playerOneId: player1Id,
      playerTwoId: player2Id,
      status: 'ACTIVE',
      letters: gameLetters,
      endsAt: endsAt
    }
  });
}

// Helper function to generate random letters with minimum word count
function generateLettersWithMinWords(length = 7, minWords = MIN_POSSIBLE_WORDS) {
  const maxAttempts = 70;
  let attempts = 0;
  let bestLetters = null;
  let bestWordCount = 0;

  while (attempts < maxAttempts) {
    // Generate random letters
    const letters = generateRandomLetters(length);

    // Check possible words
    const possibleWords = getPossibleWords(letters, 'sowpods');
    const wordCount = possibleWords.length;

    console.log(`🔍 Attempt ${attempts + 1}: ${letters} has ${wordCount} possible words`);

    // If we found enough words, return immediately
    if (wordCount >= minWords) {
      return letters;
    }

    // Keep track of the best set we've found
    if (wordCount > bestWordCount) {
      bestLetters = letters;
      bestWordCount = wordCount;
    }

    attempts++;
  }

  console.log(`⚠️ Could not find letters with ${minWords} words in ${maxAttempts} attempts. Best found: ${bestLetters} with ${bestWordCount} words`);

  // If we couldn't find a set with enough words, return the best we found
  // Or fall back to one of the known good combinations
  if (bestLetters && bestWordCount >= 15) {
    return bestLetters;
  } else {
    const knownGoodSets = ['AEIRSNT', 'ETAOINR', 'RSTLNEA', 'AEILNOR', 'AEINRST'];
    return knownGoodSets[Math.floor(Math.random() * knownGoodSets.length)];
  }
}

export async function submitWord(gameId, userId, word) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      submissions: true
    }
  });

  if (!game) {
    throw new Error('Game not found');
  }

  if (game.status !== 'ACTIVE') {
    throw new Error('Game is not active');
  }

  // Check if word is valid
  if (!isValidEnglishWord(word, 'sowpods')) {
    throw new Error('Invalid word');
  }

  // Check if word has already been used in this game
  const existingSubmission = game.submissions.find(s =>
    s.word.toLowerCase() === word.toLowerCase()
  );

  if (existingSubmission) {
    throw new Error('Word already used');
  }

  // Calculate score
  const score = calculateWordScore(word);

  // Create word submission
  const wordSubmission = await prisma.wordSubmission.create({
    data: {
      gameId,
      userId,
      word: word.toLowerCase(),
      score
    }
  });

  // Check if game is over (no more possible words)
  const allWords = game.submissions.map(s => s.word.toLowerCase());
  const possibleWords = getPossibleWords(game.letters, 'sowpods');
  const remainingWords = possibleWords.filter(w => !allWords.includes(w));

  if (remainingWords.length === 0) {
    // Calculate scores for each player
    const p1Score = game.submissions
      .filter(s => s.userId === game.playerOneId)
      .reduce((sum, s) => sum + s.score, 0);

    const p2Score = game.submissions
      .filter(s => s.userId === game.playerTwoId)
      .reduce((sum, s) => sum + s.score, 0);

    // Determine winner
    const winnerId = p1Score > p2Score
      ? game.playerOneId
      : p2Score > p1Score
        ? game.playerTwoId
        : null;

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'FINISHED',
        winnerId
      }
    });
  }

  return wordSubmission;
}

export async function getGameState(gameId) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      submissions: true,
      playerOne: { select: { username: true } },
      playerTwo: { select: { username: true } }
    }
  });

  if (!game) {
    throw new Error('Game not found');
  }

  // Get possible words count
  const possibleWords = getPossibleWords(game.letters, 'sowpods');
  const allWords = game.submissions.map(s => s.word.toLowerCase());
  const remainingWords = possibleWords.filter(w => !allWords.includes(w));

  // Calculate scores
  const p1Score = game.submissions
    .filter(s => s.userId === game.playerOneId)
    .reduce((sum, s) => sum + s.score, 0);

  const p2Score = game.submissions
    .filter(s => s.userId === game.playerTwoId)
    .reduce((sum, s) => sum + s.score, 0);

  return {
    ...game,
    p1Score,
    p2Score,
    possibleWordsCount: remainingWords.length
  };
}

// Helper function to generate random letters
function generateRandomLetters(length = 7) {
  // Weighted letter distribution based on Scrabble frequencies
  const letterWeights = {
    'A': 9, 'B': 2, 'C': 2, 'D': 4, 'E': 12, 'F': 2, 'G': 3, 'H': 2, 'I': 9,
    'J': 1, 'K': 1, 'L': 4, 'M': 2, 'N': 6, 'O': 8, 'P': 2, 'Q': 1, 'R': 6,
    'S': 4, 'T': 6, 'U': 4, 'V': 2, 'W': 2, 'X': 1, 'Y': 2, 'Z': 1
  };

  // Create weighted array
  const weightedLetters = [];
  for (const [letter, weight] of Object.entries(letterWeights)) {
    for (let i = 0; i < weight; i++) {
      weightedLetters.push(letter);
    }
  }

  // Ensure at least 2 vowels
  const vowels = 'AEIOU';
  let result = '';
  let vowelCount = 0;

  // First, add 2 vowels
  for (let i = 0; i < 2; i++) {
    const vowel = vowels[Math.floor(Math.random() * vowels.length)];
    result += vowel;
    vowelCount++;
  }

  // Then fill the rest with weighted random letters
  while (result.length < length) {
    const letter = weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
    if (vowels.includes(letter)) {
      vowelCount++;
    }
    result += letter;
  }

  // If we have too many vowels, replace some with consonants
  while (vowelCount > 4 && result.length > 0) {
    const randomIndex = Math.floor(Math.random() * result.length);
    if (vowels.includes(result[randomIndex])) {
      const consonant = weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
      if (!vowels.includes(consonant)) {
        result = result.slice(0, randomIndex) + consonant + result.slice(randomIndex + 1);
        vowelCount--;
      }
    }
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
