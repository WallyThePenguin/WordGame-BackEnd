import { getPossibleWords } from './wordValidator.js';

// In-memory store for live games
const activeGames = new Map(); // gameId -> { p1, p2 }

/**
 * Generate random letters that guarantee at least one valid word
 * @param {number} length - Number of letters to generate
 * @param {number} minWords - Minimum number of possible words required
 * @returns {string} - Generated letters
 */
export function generateRandomLetters(length = 7, minWords = 5) {
  const maxAttempts = 20; // Increased attempts since we need more words
  let attempts = 0;
  let bestLetters = null;
  let bestWordCount = 0;

  while (attempts < maxAttempts) {
    // Generate random letters
    const letters = generateRandomLettersBasic(length);

    // Check possible words
    const possibleWords = getPossibleWords(letters, 'sowpods');
    const wordCount = possibleWords.length;

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

  // If we found some words but not enough, return the best set
  if (bestWordCount > 0) {
    return bestLetters;
  }

  // If we couldn't find any valid set, use a known good combination
  return 'AEIOURT'; // Common vowels + common consonants that form many words
}

/**
 * Basic random letter generation
 * @param {number} length - Number of letters to generate
 * @returns {string} - Generated letters
 */
function generateRandomLettersBasic(length = 7) {
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

/**
 * Register a new game and track both player IDs
 * @param {string} gameId
 * @param {string} p1
 * @param {string} p2
 */
export function registerGame(gameId, p1, p2) {
  activeGames.set(gameId, { p1, p2 });
}

/**
 * Get opponent's userId from a game
 * @param {string} gameId
 * @param {string} userId
 * @returns {string|null}
 */
export function getOpponentFromGame(gameId, userId) {
  const game = activeGames.get(gameId);
  if (!game) return null;
  if (game.p1 === userId) return game.p2;
  if (game.p2 === userId) return game.p1;
  return null;
}

/**
 * Get both players in a game as [p1, p2]
 * @param {string} gameId
 * @returns {string[]} - Array of 2 user IDs, or empty if not found
 */
export function getGamePlayers(gameId) {
  const game = activeGames.get(gameId);
  if (!game) return [];
  return [game.p1, game.p2];
}

/**
 * Clean up memory once a game ends
 * @param {string} gameId
 */
export function removeGame(gameId) {
  activeGames.delete(gameId);
}

/**
 * Count possible words from a set of letters
 * @param {string} letters - The letters to check
 * @returns {Promise<number>} - The number of possible words
 */
export async function countPossibleWords(letters) {
  try {
    // Convert letters to lowercase for API
    const searchLetters = letters.toLowerCase();

    // Get all possible combinations of the letters
    const combinations = getAllCombinations(searchLetters);

    // Check each combination against the dictionary API
    const validWords = new Set();

    for (const word of combinations) {
      if (word.length < 3) continue; // Skip words shorter than 3 letters

      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        if (res.ok) {
          validWords.add(word);
        }
      } catch (err) {
        console.error(`Error checking word ${word}:`, err);
      }
    }

    return validWords.size;
  } catch (err) {
    console.error('❌ Error counting possible words:', err);
    return 0;
  }
}

/**
 * Get all possible combinations of letters
 * @param {string} letters - The letters to combine
 * @returns {string[]} - Array of possible combinations
 */
function getAllCombinations(letters) {
  const results = new Set();

  function generate(current, remaining) {
    if (current.length >= 3) { // Only add words of length 3 or more
      results.add(current);
    }

    for (let i = 0; i < remaining.length; i++) {
      generate(
        current + remaining[i],
        remaining.slice(0, i) + remaining.slice(i + 1)
      );
    }
  }

  generate('', letters);
  return Array.from(results);
}
