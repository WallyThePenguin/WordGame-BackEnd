import { practiceSessions, playerConnections } from '../state/connectionMaps.js';
import { generateRandomLetters } from '../../utils/wsHelpers.js';
import { isValidEnglishWord} from '../../utils/wordValidator.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function handle(msg, ws) {
  const { type, userId, word } = msg;
  const session = practiceSessions.get(userId);

  if (type === 'START_PRACTICE') {
    const letters = generateRandomLetters(7);
    if (session) clearInterval(session.autoRerollInterval);

    const interval = setInterval(() => {
      const s = practiceSessions.get(userId);
      if (!s) return;
      s.letters = generateRandomLetters(7);
      playerConnections.get(userId)?.send(JSON.stringify({ type: 'PRACTICE_LETTERS_UPDATED', letters: s.letters, reason: 'AUTO_REROLL' }));
    }, 30000);

    practiceSessions.set(userId, { letters, score: 0, words: new Set(), autoRerollInterval: interval });
    ws.send(JSON.stringify({ type: 'PRACTICE_STARTED', letters }));
  }

  if (type === 'PRACTICE_REROLL' && session) {
    session.letters = generateRandomLetters(7);
    ws.send(JSON.stringify({ type: 'PRACTICE_LETTERS_UPDATED', letters: session.letters, reason: 'MANUAL_REROLL' }));
  }

  if (type === 'SUBMIT_PRACTICE_WORD') {
    if (!session) {
      return ws.send(JSON.stringify({ type: 'PRACTICE_WORD_RESULT', success: false, reason: 'No session' }));
    }

    if (session.words.has(word.toLowerCase())) {
      return ws.send(JSON.stringify({ type: 'PRACTICE_WORD_RESULT', success: false, reason: 'Duplicate word' }));
    }

    const valid = await isValidEnglishWord(word);
    if (!valid) {
      return ws.send(JSON.stringify({ type: 'PRACTICE_WORD_RESULT', success: false, reason: 'Invalid word' }));
    }

    const score = word.length;
    session.score += score;
    session.words.add(word.toLowerCase());

    ws.send(JSON.stringify({
      type: 'PRACTICE_WORD_RESULT',
      success: true,
      word,
      score,
      totalScore: session.score
    }));
  }

  if (type === 'END_PRACTICE' && session) {
    clearInterval(session.autoRerollInterval);

    const existing = await prisma.practiceStat.findUnique({ where: { userId } });
    const newBest = !existing || session.score > existing.bestScore;

    await prisma.practiceStat.upsert({
      where: { userId },
      update: {
        totalPlays: { increment: 1 },
        bestScore: newBest ? session.score : existing.bestScore
      },
      create: {
        userId,
        totalPlays: 1,
        bestScore: session.score
      }
    });

    practiceSessions.delete(userId);
    ws.send(JSON.stringify({ type: 'PRACTICE_ENDED', success: true, finalScore: session.score, newBest }));
  }
}
