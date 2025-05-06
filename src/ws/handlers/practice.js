import { practiceSessions, playerConnections } from '../state/connectionMaps.js';
import { generateRandomLetters } from '../../utils/wsHelpers.js';
import { isValidEnglishWord, getPossibleWords, canFormWord } from '../../utils/wordValidator.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MIN_WORD_LENGTH = 3;
const COMBO_WINDOW = 5000; // 5 seconds
const MAX_COMBO_MULTIPLIER = 3.0;
const COMBO_MULTIPLIER_STEP = 0.25;

export async function handle(msg, ws) {
  const { type, userId, payload } = msg;
  console.log(`📨 [Practice] Received message:`, { type, userId, payload });

  const session = practiceSessions.get(userId);
  console.log(`📨 [Practice] Session exists:`, !!session);

  if (type === 'START_PRACTICE') {
    const letters = generateRandomLetters(7);
    const possibleWords = getPossibleWords(letters, 'sowpods');
    if (session) clearInterval(session.autoRerollInterval);

    const interval = setInterval(() => {
      const s = practiceSessions.get(userId);
      if (!s) return;
      s.letters = generateRandomLetters(7);
      const newPossibleWords = getPossibleWords(s.letters, 'sowpods');
      playerConnections.get(userId)?.send(JSON.stringify({
        type: 'PRACTICE_LETTERS_UPDATED',
        letters: s.letters,
        reason: 'AUTO_REROLL',
        possibleWords: newPossibleWords.length
      }));
    }, 30000);

    practiceSessions.set(userId, {
      letters,
      score: 0,
      words: new Set(),
      autoRerollInterval: interval,
      lastWordTimestamp: 0,
      currentComboLevel: 0,
      comboStreak: 0
    });

    ws.send(JSON.stringify({
      type: 'PRACTICE_STARTED',
      letters,
      isNewSession: true,
      possibleWords: possibleWords.length
    }));
  }

  if (type === 'PRACTICE_REROLL' && session) {
    session.letters = generateRandomLetters(7);
    const possibleWords = getPossibleWords(session.letters, 'sowpods');
    ws.send(JSON.stringify({
      type: 'PRACTICE_LETTERS_UPDATED',
      letters: session.letters,
      reason: 'MANUAL_REROLL',
      possibleWords: possibleWords.length
    }));
  }

  if (type === 'PRACTICE_WORD_SUBMIT') {
    console.log(`📨 [Practice] Processing word submission:`, { word: payload?.word, sessionExists: !!session });

    if (!session) {
      console.log(`❌ [Practice] No session found for user:`, userId);
      return ws.send(JSON.stringify({
        type: 'PRACTICE_WORD_RESULT',
        success: false,
        reason: 'No session',
        error: 'Please start a practice session first'
      }));
    }

    const word = payload?.word?.toLowerCase();
    if (!word) {
      console.log(`❌ [Practice] No word provided in payload:`, payload);
      return ws.send(JSON.stringify({
        type: 'PRACTICE_WORD_RESULT',
        success: false,
        reason: 'No word provided',
        error: 'Please provide a word to submit'
      }));
    }

    if (word.length < MIN_WORD_LENGTH) {
      console.log(`❌ [Practice] Word too short:`, word);
      session.currentComboLevel = 0;
      session.comboStreak = 0;
      return ws.send(JSON.stringify({
        type: 'PRACTICE_WORD_RESULT',
        success: false,
        reason: 'Word too short',
        error: `Words must be at least ${MIN_WORD_LENGTH} letters long`
      }));
    }

    console.log(`📨 [Practice] Checking word:`, { word, currentWords: Array.from(session.words) });

    if (session.words.has(word)) {
      console.log(`❌ [Practice] Duplicate word:`, word);
      session.currentComboLevel = 0;
      session.comboStreak = 0;
      return ws.send(JSON.stringify({
        type: 'PRACTICE_WORD_RESULT',
        success: false,
        reason: 'Duplicate word',
        error: 'You have already used this word'
      }));
    }

    if (!canFormWord(word, session.letters)) {
      console.log(`❌ [Practice] Cannot form word from letters:`, { word, letters: session.letters });
      session.currentComboLevel = 0;
      session.comboStreak = 0;
      return ws.send(JSON.stringify({
        type: 'PRACTICE_WORD_RESULT',
        success: false,
        reason: 'Invalid letters',
        error: 'Cannot form this word from the available letters'
      }));
    }

    const valid = isValidEnglishWord(word, 'sowpods');
    console.log(`📨 [Practice] Word validation result:`, { word, valid });

    if (!valid) {
      console.log(`❌ [Practice] Invalid word:`, word);
      session.currentComboLevel = 0;
      session.comboStreak = 0;
      return ws.send(JSON.stringify({
        type: 'PRACTICE_WORD_RESULT',
        success: false,
        reason: 'Invalid word',
        error: 'This is not a valid English word'
      }));
    }

    // Update combo state
    const now = Date.now();
    if (now - session.lastWordTimestamp <= COMBO_WINDOW) {
      session.currentComboLevel += 1;
      session.comboStreak += 1;
    } else {
      session.currentComboLevel = 0;
      session.comboStreak = 0;
    }
    session.lastWordTimestamp = now;

    // Calculate combo bonus
    const baseScore = word.length;
    const multiplier = Math.min(1 + session.currentComboLevel * COMBO_MULTIPLIER_STEP, MAX_COMBO_MULTIPLIER);
    const totalScore = Math.floor(baseScore * multiplier);
    const bonusScore = totalScore - baseScore;

    session.score += totalScore;
    session.words.add(word);

    const response = {
      type: 'PRACTICE_WORD_RESULT',
      success: true,
      word,
      baseScore,
      bonusScore,
      totalScore,
      comboLevel: session.currentComboLevel,
      comboStreak: session.comboStreak,
      finalScore: session.score,
      message: session.comboStreak > 1 ? `Combo x${session.comboStreak}!` : 'Good word!'
    };

    console.log(`✅ [Practice] Sending success response:`, response);
    ws.send(JSON.stringify(response));
  }

  if (type === 'END_PRACTICE' && session) {
    clearInterval(session.autoRerollInterval);

    try {
      const existing = await prisma.practiceStat.findUnique({ where: { userId } });
      const newBest = !existing || session.score > existing.bestScore;

      await prisma.practiceStat.upsert({
        where: { userId },
        update: {
          totalPlays: { increment: 1 },
          bestScore: newBest ? session.score : existing.bestScore,
          totalScore: { increment: session.score }
        },
        create: {
          userId,
          totalPlays: 1,
          bestScore: session.score,
          totalScore: session.score
        }
      });

      practiceSessions.delete(userId);
      ws.send(JSON.stringify({
        type: 'PRACTICE_ENDED',
        success: true,
        finalScore: session.score,
        newBest,
        stats: {
          wordsFound: session.words.size,
          bestCombo: session.comboStreak
        }
      }));
    } catch (error) {
      console.error('❌ [Practice] Error saving practice stats:', error);
      ws.send(JSON.stringify({
        type: 'PRACTICE_ENDED',
        success: false,
        error: 'Failed to save practice stats'
      }));
    }
  }
}
