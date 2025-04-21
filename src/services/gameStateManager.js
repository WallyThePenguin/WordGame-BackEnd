import { finalizeGame } from './gameService.js';
import { playerConnections } from '../ws/state/connectionMaps.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Internal maps
const activeGameTimers = new Map();
const activeGameStatus = new Map();
const gamePlayerMap = new Map();

/**
 * Registers a game and starts its finalization timer.
 */
export function registerGame(gameId, player1, player2, endsAt) {
  gamePlayerMap.set(gameId, [player1, player2]);
  activeGameStatus.set(gameId, true);

  const msRemaining = new Date(endsAt).getTime() - Date.now();

  const timer = setTimeout(async () => {
    await forceFinalize(gameId);
  }, msRemaining);

  activeGameTimers.set(gameId, timer);
}

/**
 * Finalizes a game and notifies players.
 */
export async function forceFinalize(gameId) {
  if (!activeGameStatus.get(gameId)) return;

  activeGameStatus.set(gameId, false);
  activeGameTimers.delete(gameId);

  const { scores, winnerId } = await finalizeGame(gameId);
  const [p1, p2] = gamePlayerMap.get(gameId) || [];

  [p1, p2].forEach((uid) => {
    const conn = playerConnections.get(uid);
    if (conn?.readyState === 1) {
      conn.send(JSON.stringify({
        type: 'GAME_OVER',
        scores,
        winnerId
      }));
    }
  });

  gamePlayerMap.delete(gameId);
}

export async function recoverGamesOnStartup() {
 const now = new Date();

 // 🔻 Step 1: Finalize expired active games
 const expiredGames = await prisma.game.findMany({
   where: {
     status: 'ACTIVE',
     endsAt: { lt: now }
   }
 });

 for (const game of expiredGames) {
   console.log(`⚠️ Finalizing expired game: ${game.id}`);
   await finalizeGame(game.id);
 }

 // 🔁 Step 2: Restore timers for games still in progress
 const activeGames = await prisma.game.findMany({
   where: {
     status: 'ACTIVE',
     endsAt: { gt: now }
   }
 });

 for (const game of activeGames) {
   registerGame(game.id, game.playerOneId, game.playerTwoId, game.endsAt);
 }

 console.log(`✅ Game recovery complete. Finalized ${expiredGames.length}, Restored ${activeGames.length}`);
}

/**
 * Utility: Check if game is active
 */
export function isGameActive(gameId) {
  return activeGameStatus.get(gameId) === true;
}
