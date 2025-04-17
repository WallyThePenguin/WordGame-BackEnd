import { PrismaClient } from '@prisma/client';
import { isValidEnglishWord } from '../utils/wordValidator.js';

const prisma = new PrismaClient();

export async function submitWord({ gameId, userId, word }) {
  // Check if it's a real word
  const valid = await isValidEnglishWord(word);
  if (!valid) {
    throw new Error("Invalid word — not found in dictionary.");
  }

  // TODO: Check for duplicate (via Redis or DB)

  const score = word.length; // Simple scoring rule

  await prisma.wordSubmission.create({
    data: {
      gameId,
      userId,
      word,
      score,
    }
  });

  return { word, score };
}
