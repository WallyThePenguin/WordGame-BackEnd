import {
  playerConnections, socketUserMap, matchmakingQueue, activeGameStatus
} from '../state/connectionMaps.js';
import { createGame } from '../../services/gameService.js';
import { generateRandomLetters, getOpponentFromGame } from '../../utils/wsHelpers.js';
import { submitWord } from '../../services/wordService.js';
import { getPossibleWords } from '../../utils/wordValidator.js';
import { updateComboState, resetComboState } from '../../utils/comboUtil.js';
import { isGameActive, registerGame } from '../../services/gameStateManager.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Track users who were in queue but disconnected (for up to 30 seconds)
const recentlyDisconnected = new Map(); // userId → { timestamp, position }

// Cleanup function for disconnected users
function cleanupDisconnectedUsers() {
  const now = Date.now();
  const MAX_RECONNECT_TIME = 30 * 1000; // 30 seconds

  for (const [userId, data] of recentlyDisconnected.entries()) {
    if (now - data.timestamp > MAX_RECONNECT_TIME) {
      console.log(`⏱️ [Queue] User ${userId} reconnect window expired, removing from pending queue`);
      recentlyDisconnected.delete(userId);
    }
  }
}

// Start cleanup interval
setInterval(cleanupDisconnectedUsers, 10000);

// Handle user disconnection from queue
function handleQueueDisconnection(userId) {
  const index = matchmakingQueue.indexOf(userId);
  if (index !== -1) {
    console.log(`📝 [Queue] User ${userId} disconnected while in queue, storing state for reconnection`);
    recentlyDisconnected.set(userId, {
      timestamp: Date.now(),
      position: index
    });

    // Note: We intentionally don't remove from queue yet to prevent frequent join/leave
    // Actual removal happens in cleanup if they don't reconnect in time
    // matchmakingQueue.splice(index, 1);
  }
}

// Handle user reconnection to queue
function handleQueueReconnection(userId, ws) {
  const reconnectData = recentlyDisconnected.get(userId);

  if (reconnectData) {
    console.log(`🔄 [Queue] User ${userId} reconnected within window, restoring queue state`);

    // Remove reconnection data
    recentlyDisconnected.delete(userId);

    // If not already in queue, add back with better position
    if (!matchmakingQueue.includes(userId)) {
      // Try to restore close to original position, but don't go beyond current size
      const newPosition = Math.min(reconnectData.position, matchmakingQueue.length);
      matchmakingQueue.splice(newPosition, 0, userId);

      console.log(`✅ [Queue] Restored user ${userId} to queue at position ${newPosition + 1}`);

      // Notify user about rejoining
      ws.send(JSON.stringify({
        type: 'QUEUE_JOINED',
        position: newPosition + 1,
        wasReconnect: true
      }));

      // Broadcast queue update
      broadcastQueueUpdate();
      return true;
    }
  }

  return false;
}

// Get all active WebSockets for a user
function getUserConnections(userId) {
  const connections = [];
  for (const [socket, id] of socketUserMap.entries()) {
    if (id === userId && socket.readyState === 1) {
      connections.push(socket);
    }
  }
  return connections;
}

// Send a message to all active connections for a user
function sendToUser(userId, message) {
  const connections = getUserConnections(userId);
  console.log(`📤 [WS] Sending to ${connections.length} connections for user ${userId}`);

  let sentCount = 0;
  for (const socket of connections) {
    try {
      socket.send(JSON.stringify(message));
      sentCount++;
    } catch (error) {
      console.error(`❌ [WS] Error sending to socket for ${userId}:`, error);
    }
  }

  console.log(`📊 [WS] Successfully sent to ${sentCount}/${connections.length} connections for user ${userId}`);
  return sentCount > 0;
}

// Prevent matching players from same IP address
async function getQueuedPlayerDetails() {
  // Get user details for all players in the queue
  const playerDetails = await Promise.all(
    matchmakingQueue.map(async (userId) => {
      // Check if user has any active connections
      const connections = getUserConnections(userId);
      if (connections.length === 0) return null;

      try {
        // Get user info from database
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true }
        });

        return user ? { userId, username: user.username } : null;
      } catch (error) {
        console.error(`❌ [Queue] Error getting user details for ${userId}:`, error);
        return null;
      }
    })
  );

  // Filter out null entries (users not found)
  return playerDetails.filter(player => player !== null);
}

// Find suitable players to match
async function findPlayersToMatch() {
  if (matchmakingQueue.length < 2) return null;

  // Get first player
  const p1 = matchmakingQueue[0];

  // Try to find a suitable opponent (anyone but themselves with valid connection)
  for (let i = 1; i < matchmakingQueue.length; i++) {
    const p2 = matchmakingQueue[i];

    // Skip if same user (multiple browser tabs)
    if (p1 === p2) {
      console.log(`⚠️ [Queue] Skipping self-match for user ${p1}`);
      continue;
    }

    // Make sure both players still have active connections
    if (getUserConnections(p1).length === 0 || getUserConnections(p2).length === 0) {
      console.log(`⚠️ [Queue] Skipping match due to inactive connection`);
      continue;
    }

    return [p1, p2, i]; // Return both player IDs and index of p2
  }

  return null; // No suitable match found
}

// Send queue updates to all connected players in the queue
function broadcastQueueUpdate() {
  const queueCount = matchmakingQueue.length;
  console.log(`📢 [Queue] Broadcasting queue update to ${queueCount} players`);

  let sentCount = 0;
  matchmakingQueue.forEach(userId => {
    const success = sendToUser(userId, {
      type: 'QUEUE_UPDATE',
      playersInQueue: queueCount
    });

    if (success) sentCount++;
  });

  console.log(`📊 [Queue] Sent updates to ${sentCount}/${queueCount} players`);
}

export async function launchGame(p1, p2) {
  console.log(`🎮 [Game] Creating new game for players ${p1} and ${p2}`);

  try {
    // Call the game service to create a new game
    // Let the game service handle generating letters with minimum word count
    console.log(`🔄 [Game] Creating game: playerOneId=${p1}, playerTwoId=${p2}`);
    const game = await createGame(p1, p2);
    console.log(`✅ [Game] Created game with ID ${game.id} using letters: ${game.letters}`);

    registerGame(game.id, p1, p2, game.endsAt); // memory + timer registration
    console.log(`⏱️ [Game] Registered game timer, ends at ${game.endsAt}`);

    let notifiedCount = 0;

    // Send to player 1
    const p1Success = sendToUser(p1, {
      type: 'QUEUE_MATCHED',
      gameId: game.id,
      opponentId: p2,
    });

    if (p1Success) {
      sendToUser(p1, {
        type: 'GAME_START',
        gameId: game.id,
        opponentId: p2,
        letters: game.letters,
        endsAt: game.endsAt
      });
      notifiedCount++;
    }

    // Send to player 2
    const p2Success = sendToUser(p2, {
      type: 'QUEUE_MATCHED',
      gameId: game.id,
      opponentId: p1,
    });

    if (p2Success) {
      sendToUser(p2, {
        type: 'GAME_START',
        gameId: game.id,
        opponentId: p1,
        letters: game.letters,
        endsAt: game.endsAt
      });
      notifiedCount++;
    }

    console.log(`📊 [Game] Notified ${notifiedCount}/2 players about new game ${game.id}`);
    return game;
  } catch (error) {
    console.error(`❌ [Game] Failed to create game:`, error);
    throw error;
  }
}

export function handleDisconnect(userId) {
  handleQueueDisconnection(userId);
}

export async function handle(msg, ws) {
  // Extract fields from message, handling nested payload structure
  const { type, userId } = msg;

  // Extract gameId and word, handling various message formats
  let gameId = null;
  let word = null;

  // Try to find gameId in all possible locations
  if (msg.gameId) {
    gameId = msg.gameId;
  } else if (msg.payload) {
    if (typeof msg.payload === 'object') {
      if (msg.payload.gameId) {
        gameId = msg.payload.gameId;
      } else if (msg.payload.payload && typeof msg.payload.payload === 'object') {
        if (msg.payload.payload.gameId) {
          gameId = msg.payload.payload.gameId;
        }
      }
    }
  }

  // Try to find word in all possible locations
  if (msg.word) {
    word = msg.word;
  } else if (msg.payload) {
    if (typeof msg.payload === 'object' && msg.payload.word) {
      word = msg.payload.word;
    }
  }

  // Log the received message for debugging
  console.log(`🔍 [PVP] Parsed message:`, {
    type,
    userId,
    gameId: gameId || 'N/A',
    wordLength: word ? word.length : 'N/A',
    originalMessage: JSON.stringify(msg).slice(0, 200)
  });

  // Handle PING messages (keepalive)
  if (type === 'PING') {
    return ws.send(JSON.stringify({
      type: 'PONG',
      timestamp: Date.now()
    }));
  }

  // Handle GET_GAME_STATE
  if (type === 'GET_GAME_STATE') {
    if (!gameId) {
      console.error(`❌ [Game] No gameId provided in GET_GAME_STATE message`);
      return ws.send(JSON.stringify({
        type: 'GAME_ERROR',
        message: 'Game ID is required'
      }));
    }

    console.log(`🎮 [Game] User ${userId} requesting state for game ${gameId}`);

    try {
      // Find the game
      console.log(`🔍 [Game] Looking up game ${gameId} in database`);
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          playerOne: { select: { id: true, username: true } },
          playerTwo: { select: { id: true, username: true } },
          submissions: true
        }
      });

      if (!game) {
        console.warn(`⚠️ [Game] Game ${gameId} not found for user ${userId}`);
        return ws.send(JSON.stringify({
          type: 'GAME_ERROR',
          message: 'Game not found'
        }));
      }

      console.log(`✅ [Game] Found game ${gameId} with players: ${game.playerOneId} and ${game.playerTwoId}`);

      // Check if player is part of this game
      if (game.playerOneId !== userId && game.playerTwoId !== userId) {
        console.warn(`⚠️ [Game] User ${userId} tried to get state for game ${gameId} but is not a participant`);
        return ws.send(JSON.stringify({
          type: 'GAME_ERROR',
          message: 'You are not part of this game'
        }));
      }

      // Get opponent ID
      const opponentId = game.playerOneId === userId ? game.playerTwoId : game.playerOneId;
      console.log(`ℹ️ [Game] User ${userId} opponent is ${opponentId}`);

      const yourSubmissions = game.submissions.filter(s => s.userId === userId);
      const opponentSubmissions = game.submissions.filter(s => s.userId === opponentId);

      console.log(`📊 [Game] User ${userId} has ${yourSubmissions.length} submissions, opponent has ${opponentSubmissions.length}`);

      // Get possible words count
      const possibleWords = getPossibleWords(game.letters, 'sowpods');
      const allWords = game.submissions.map(s => s.word.toLowerCase());
      const remainingWords = possibleWords.filter(w => !allWords.includes(w));

      // Calculate scores
      const yourScore = yourSubmissions.reduce((sum, s) => sum + s.score, 0);
      const opponentScore = opponentSubmissions.reduce((sum, s) => sum + s.score, 0);

      // Send game state to the player
      console.log(`📤 [Game] Sending GAME_STATE to user ${userId}`);
      ws.send(JSON.stringify({
        type: 'GAME_STATE',
        game: {
          id: game.id,
          letters: game.letters,
          endsAt: game.endsAt,
          status: game.status,
          opponentId,
          opponentUsername: game.playerOneId === userId ? game.playerTwo.username : game.playerOne.username,
          yourSubmissions: yourSubmissions,
          opponentSubmissionCount: opponentSubmissions.length,
          yourScore,
          opponentScore,
          possibleWordsRemaining: remainingWords.length,
          totalPossibleWords: possibleWords.length
        }
      }));

      console.log(`🎮 [Game] Successfully sent game state to ${userId} for game ${gameId}`);
    } catch (error) {
      console.error(`❌ [Game] Error getting game state for ${gameId}:`, error);
      ws.send(JSON.stringify({
        type: 'GAME_ERROR',
        message: 'Failed to get game state'
      }));
    }

    return;
  }

  // Check for any "hello" or initial message - attempt to restore queue if needed
  if (type === 'HELLO' || type === 'GET_STATUS') {
    // Check if user was in queue and handle reconnection
    if (handleQueueReconnection(userId, ws)) {
      return; // Queue state restored
    }

    // If not in reconnection state, just return current status
    return ws.send(JSON.stringify({
      type: 'STATUS_UPDATE',
      inQueue: matchmakingQueue.includes(userId),
      queuePosition: matchmakingQueue.indexOf(userId) + 1,
      queueSize: matchmakingQueue.length
    }));
  }

  if (type === 'JOIN_QUEUE') {
    // Check if player is already in queue
    if (matchmakingQueue.includes(userId)) {
      console.log(`ℹ️ [Queue] User ${userId} is already in queue, position: ${matchmakingQueue.indexOf(userId) + 1}`);
      return ws.send(JSON.stringify({
        type: 'QUEUE_JOINED',
        position: matchmakingQueue.indexOf(userId) + 1,
        alreadyInQueue: true
      }));
    }

    // Check if user recently disconnected and handle reconnection
    if (handleQueueReconnection(userId, ws)) {
      return; // Queue state restored
    }

    console.log(`➕ [Queue] Adding user ${userId} to matchmaking queue`);
    matchmakingQueue.push(userId);

    const position = matchmakingQueue.length;
    console.log(`📤 [Queue] Sending QUEUE_JOINED to user ${userId}, position: ${position}`);

    // Notify player they've joined the queue
    ws.send(JSON.stringify({
      type: 'QUEUE_JOINED',
      position: position
    }));

    // Broadcast queue update to all players in queue
    broadcastQueueUpdate();

    console.log(`👥 [Queue] Player ${userId} joined queue. Total in queue: ${matchmakingQueue.length}`);

    // Check if we can match players
    if (matchmakingQueue.length >= 2) {
      console.log(`🔄 [Queue] Enough players in queue (${matchmakingQueue.length}), attempting to match`);

      try {
        const matchResult = await findPlayersToMatch();

        if (matchResult) {
          const [p1, p2, p2Index] = matchResult;
          console.log(`✅ [Queue] Found suitable match: ${p1} and ${p2}`);

          // Remove matched players from queue (in reverse order to maintain indices)
          matchmakingQueue.splice(p2Index, 1); // Remove second player first
          matchmakingQueue.splice(0, 1); // Remove first player

          console.log(`✅ [Queue] Matching players ${p1} and ${p2}`);

          await launchGame(p1, p2);
          console.log(`🎉 [Queue] Successfully launched game for ${p1} and ${p2}`);

          // Update remaining players in queue
          console.log(`🔄 [Queue] Updating remaining ${matchmakingQueue.length} players in queue`);
          broadcastQueueUpdate();
        } else {
          console.log(`⏳ [Queue] No suitable match found yet, waiting for more players`);
        }
      } catch (error) {
        console.error(`❌ [Queue] Failed to match players:`, error);
      }
    } else {
      console.log(`⏳ [Queue] Not enough players to match yet (${matchmakingQueue.length}/2)`);
    }
  }

  if (type === 'LEAVE_QUEUE') {
    // Remove player from queue
    const index = matchmakingQueue.indexOf(userId);
    if (index !== -1) {
      console.log(`➖ [Queue] Removing user ${userId} from queue at position ${index + 1}`);
      matchmakingQueue.splice(index, 1);

      // Also remove from recently disconnected if present
      if (recentlyDisconnected.has(userId)) {
        recentlyDisconnected.delete(userId);
      }

      console.log(`👋 [Queue] Player ${userId} left queue. Total in queue: ${matchmakingQueue.length}`);

      // Broadcast queue update
      broadcastQueueUpdate();

      // Notify player they've left the queue
      console.log(`📤 [Queue] Sending QUEUE_LEFT to user ${userId}`);
      ws.send(JSON.stringify({
        type: 'QUEUE_LEFT'
      }));
    } else {
      console.log(`ℹ️ [Queue] User ${userId} tried to leave queue but was not in queue`);
      ws.send(JSON.stringify({
        type: 'QUEUE_LEFT',
        wasInQueue: false
      }));
    }
  }

  if (type === 'JOIN_GAME') {
    if (!gameId) {
      console.error(`❌ [Game] No gameId provided in JOIN_GAME message:`, msg);
      return ws.send(JSON.stringify({
        type: 'GAME_ERROR',
        message: 'Game ID is required'
      }));
    }

    console.log(`🎮 [Game] User ${userId} joining game ${gameId}`);

    try {
      // Find the game
      console.log(`🔍 [Game] Looking up game ${gameId} in database`);
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          playerOne: { select: { id: true, username: true } },
          playerTwo: { select: { id: true, username: true } },
          submissions: true
        }
      });

      if (!game) {
        console.warn(`⚠️ [Game] Game ${gameId} not found for user ${userId}`);
        return ws.send(JSON.stringify({
          type: 'GAME_ERROR',
          message: 'Game not found'
        }));
      }

      console.log(`✅ [Game] Found game ${gameId} with players: ${game.playerOneId} and ${game.playerTwoId}`);

      // Check if player is part of this game
      if (game.playerOneId !== userId && game.playerTwoId !== userId) {
        console.warn(`⚠️ [Game] User ${userId} tried to join game ${gameId} but is not a participant`);
        return ws.send(JSON.stringify({
          type: 'GAME_ERROR',
          message: 'You are not part of this game'
        }));
      }

      // Get opponent ID
      const opponentId = game.playerOneId === userId ? game.playerTwoId : game.playerOneId;
      console.log(`ℹ️ [Game] User ${userId} opponent is ${opponentId}`);

      const yourSubmissions = game.submissions.filter(s => s.userId === userId);
      const opponentSubmissions = game.submissions.filter(s => s.userId === opponentId);

      console.log(`📊 [Game] User ${userId} has ${yourSubmissions.length} submissions, opponent has ${opponentSubmissions.length}`);

      // Send game state to the player
      console.log(`📤 [Game] Sending GAME_STATE to user ${userId}`);
      ws.send(JSON.stringify({
        type: 'GAME_STATE',
        game: {
          id: game.id,
          letters: game.letters,
          endsAt: game.endsAt,
          status: game.status,
          opponentId,
          opponentUsername: game.playerOneId === userId ? game.playerTwo.username : game.playerOne.username,
          yourSubmissions: yourSubmissions,
          opponentSubmissionCount: opponentSubmissions.length
        }
      }));

      // Notify opponent that player has joined
      console.log(`📤 [Game] Notifying opponent ${opponentId} that ${userId} joined game ${gameId}`);
      sendToUser(opponentId, {
        type: 'OPPONENT_JOINED_GAME',
        gameId,
        userId
      });

      console.log(`🎮 [Game] Player ${userId} successfully joined game ${gameId}`);
    } catch (error) {
      console.error(`❌ [Game] Error joining game ${gameId} for user ${userId}:`, error);
      ws.send(JSON.stringify({
        type: 'GAME_ERROR',
        message: 'Failed to join game'
      }));
    }
  }

  if (type === 'LEAVE_GAME' && gameId) {
    console.log(`👋 [Game] User ${userId} leaving game ${gameId}`);

    // Notify opponent that player has left
    const opponentId = getOpponentFromGame(gameId, userId);
    if (opponentId) {
      console.log(`ℹ️ [Game] Found opponent ${opponentId} for user ${userId} in game ${gameId}`);

      console.log(`📤 [Game] Notifying opponent ${opponentId} that ${userId} left game ${gameId}`);
      sendToUser(opponentId, {
        type: 'OPPONENT_LEFT_GAME',
        gameId,
        userId
      });
    } else {
      console.warn(`⚠️ [Game] Could not find opponent for user ${userId} in game ${gameId}`);
    }

    console.log(`👋 [Game] Player ${userId} left game ${gameId}`);
  }

  if (type === 'SUBMIT_WORD') {
    console.log(`📝 [Game] User ${userId} submitting word in game ${gameId}: '${word}'`);

    if (!isGameActive(gameId)) {
      console.warn(`⚠️ [Game] User ${userId} tried to submit word in inactive game ${gameId}`);
      ws.send(JSON.stringify({
        type: 'WORD_SUBMISSION_RESULT',
        success: false,
        reason: 'Game has ended'
      }));
      return;
    }

    console.log(`🔍 [Game] Processing word submission for user ${userId} in game ${gameId}`);
    const result = await submitWord({ gameId, userId, word });

    console.log(`📤 [Game] Sending submission result to user ${userId}: ${result.success ? 'success' : 'failed'}`);
    ws.send(JSON.stringify({ type: 'WORD_SUBMISSION_RESULT', ...result }));

    if (result.success) {
      console.log(`✅ [Game] Valid word submission by ${userId} in game ${gameId}`);

      const { totalScore, bonusScore, comboLevel } = await updateComboState(gameId, userId, result.score || 0);
      console.log(`🔢 [Game] Updated combo state for ${userId}: level ${comboLevel}, bonus ${bonusScore}, total ${totalScore}`);

      ws.send(JSON.stringify({
        type: 'COMBO_BONUS',
        word,
        comboLevel,
        bonusScore,
        totalScore
      }));

      const opponentId = getOpponentFromGame(gameId, userId);
      console.log(`📤 [Game] Notifying opponent ${opponentId} about word submission`);

      sendToUser(opponentId, {
        type: 'OPPONENT_SUBMITTED',
        word,
        userId
      });
    } else {
      console.log(`❌ [Game] Invalid word submission by ${userId} in game ${gameId}: ${result.reason}`);

      await resetComboState(gameId, userId);
      console.log(`🔄 [Game] Reset combo state for ${userId} due to invalid submission`);

      ws.send(JSON.stringify({
        type: 'COMBO_RESET',
        reason: 'invalid_or_duplicate',
        word
      }));
    }
  }
}


