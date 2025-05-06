import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dictionary types
const DICTIONARIES = {
  SOWPODS: 'sowpods.txt',    // International Scrabble
  TWL: 'twl06.txt',         // North American Scrabble
  ENGLISH: 'english.txt'     // General English
};

// Cache for word validation results
const wordCache = new Map();
const CACHE_SIZE = 1000; // Keep last 1000 validations in memory

// Main dictionary storage
let dictionaries = {
  sowpods: new Set(),
  twl: new Set(),
  english: new Set()
};

// Word length filters (for memory optimization)
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 15;

/**
 * Load all dictionaries into memory
 */
export async function loadDictionaries() {
  try {
    const loadPromises = Object.entries(DICTIONARIES).map(async ([name, file]) => {
      const dictPath = path.join(__dirname, '../../data', file);
      const words = await fs.readFile(dictPath, 'utf-8');
      const wordSet = new Set(
        words.split('\n')
          .map(word => word.toLowerCase().trim())
          .filter(word => word.length >= MIN_WORD_LENGTH && word.length <= MAX_WORD_LENGTH)
      );
      dictionaries[name.toLowerCase()] = wordSet;
      console.log(`✅ Loaded ${wordSet.size} words from ${name} dictionary`);
    });

    await Promise.all(loadPromises);
    return true;
  } catch (error) {
    console.error('❌ Failed to load dictionaries:', error);
    return false;
  }
}

/**
 * Validate a word against the specified dictionary
 * @param {string} word - The word to validate
 * @param {string} [dictType='sowpods'] - Dictionary to use (sowpods, twl, english)
 * @returns {boolean} - Whether the word is valid
 */
export function isValidEnglishWord(word, dictType = 'sowpods') {
  if (!word) return false;

  const normalizedWord = word.toLowerCase().trim();

  // Check cache first
  const cacheKey = `${normalizedWord}:${dictType}`;
  if (wordCache.has(cacheKey)) {
    return wordCache.get(cacheKey);
  }

  // Basic validation
  if (normalizedWord.length < MIN_WORD_LENGTH || normalizedWord.length > MAX_WORD_LENGTH) {
    return false;
  }

  // Check if word contains only letters
  if (!/^[a-z]+$/.test(normalizedWord)) {
    return false;
  }

  // Check dictionary
  const isValid = dictionaries[dictType]?.has(normalizedWord) ?? false;

  // Update cache
  if (wordCache.size >= CACHE_SIZE) {
    // Remove oldest entry if cache is full
    const firstKey = wordCache.keys().next().value;
    wordCache.delete(firstKey);
  }
  wordCache.set(cacheKey, isValid);

  return isValid;
}

/**
 * Get all valid words that can be made from a set of letters
 * @param {string} letters - The letters to check
 * @param {string} [dictType='sowpods'] - Dictionary to use
 * @returns {string[]} - Array of valid words
 */
export function getPossibleWords(letters, dictType = 'sowpods') {
  const normalizedLetters = letters.toLowerCase();
  const possibleWords = new Set();

  // Generate all possible combinations
  function generate(current, remaining) {
    if (current.length >= MIN_WORD_LENGTH) {
      if (isValidEnglishWord(current, dictType)) {
        possibleWords.add(current);
      }
    }

    for (let i = 0; i < remaining.length; i++) {
      generate(
        current + remaining[i],
        remaining.slice(0, i) + remaining.slice(i + 1)
      );
    }
  }

  generate('', normalizedLetters);
  return Array.from(possibleWords);
}

/**
 * Get dictionary statistics
 * @returns {Object} - Dictionary statistics
 */
export function getDictionaryStats() {
  return {
    sowpods: dictionaries.sowpods.size,
    twl: dictionaries.twl.size,
    english: dictionaries.english.size,
    cacheSize: wordCache.size
  };
}

/**
 * Clear the word validation cache
 */
export function clearWordCache() {
  wordCache.clear();
}

/**
 * Check if a word can be formed from a set of letters
 * @param {string} word - The word to check
 * @param {string} letters - The available letters
 * @returns {boolean} - Whether the word can be formed
 */
export function canFormWord(word, letters) {
  if (!word || !letters) return false;

  const wordLetters = word.toLowerCase().split('');
  const availableLetters = letters.toLowerCase().split('');
  const letterCounts = new Map();

  // Count available letters
  for (const letter of availableLetters) {
    letterCounts.set(letter, (letterCounts.get(letter) || 0) + 1);
  }

  // Check if we have enough of each letter
  for (const letter of wordLetters) {
    const count = letterCounts.get(letter) || 0;
    if (count === 0) return false;
    letterCounts.set(letter, count - 1);
  }

  return true;
}
