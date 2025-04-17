import fetch from 'node-fetch';

export async function isValidEnglishWord(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    
    if (!res.ok) {
      return false; // Word not found
    }

    const data = await res.json();
    return Array.isArray(data); // Valid response = array of definitions
  } catch (err) {
    console.error(`❌ Error validating word: ${word}`, err);
    return false;
  }
}
