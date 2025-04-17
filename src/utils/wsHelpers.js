// In-memory store for live games
const activeGames = new Map(); // gameId -> { p1, p2 }

/**
 * Generate a random letter set of given length
 * @param {number} length
 * @returns {string}
 */
export function generateRandomLetters(length = 7) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
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
