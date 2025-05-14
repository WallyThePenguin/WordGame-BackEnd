import { getPossibleWords, loadDictionaries } from './src/utils/wordValidator.js';

async function testLetterSets() {
    await loadDictionaries();

    // Test some known letter sets
    const knownSets = ['AEIRSNT', 'ETAOINR', 'AEIOURT', 'RSTLNEA'];

    console.log("Testing known good letter sets:");
    for (const letters of knownSets) {
        const words = getPossibleWords(letters, 'sowpods');
        console.log(`${letters}: ${words.length} possible words`);
    }

    // Test the letter generation function
    console.log("\nAttempting random letter generation with different requirements:");
    const attempts = 10;
    const requirements = [5, 10, 20, 30, 40, 50];

    for (const minWords of requirements) {
        console.log(`\nTesting with minWords = ${minWords}:`);
        let successCount = 0;

        for (let i = 0; i < attempts; i++) {
            const letters = generateLettersWithMinWords(7, minWords);
            const wordCount = getPossibleWords(letters, 'sowpods').length;
            console.log(`  Attempt ${i + 1}: ${letters} - ${wordCount} words`);
            if (wordCount >= minWords) successCount++;
        }

        console.log(`  Success rate for ${minWords} min words: ${successCount}/${attempts} (${(successCount / attempts * 100).toFixed(1)}%)`);
    }
}

// Copy of the letter generation function from gameService.js
function generateLettersWithMinWords(length = 7, minWords) {
    const maxAttempts = 50;
    let attempts = 0;
    let bestLetters = null;
    let bestWordCount = 0;

    while (attempts < maxAttempts) {
        // Generate random letters
        const letters = generateRandomLetters(length);

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

    // If we couldn't find a set with enough words, return the best we found
    // Or fall back to a known good combination
    return bestLetters || 'AEIRSNT';
}

// Copy of the letter generation function from wsHelpers.js
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

testLetterSets().catch(console.error); 