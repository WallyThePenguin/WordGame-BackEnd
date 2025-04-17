import {
    playerConnections, matchmakingQueue,
    activeGameTimers, activeGameStatus
  } from '../state/connectionMaps.js';
  import { createGame, finalizeGame } from '../../services/gameService.js';
  import { generateRandomLetters, getOpponentFromGame, registerGame } from '../../utils/wsHelpers.js';
  import { submitWord } from '../../services/wordService.js';
  import { GAME_DURATION_SECONDS } from '../../config/gameConfig.js';
  
  function startGameTimer(gameId, duration, p1, p2) {
    let remaining = duration;
    const tickInterval = setInterval(() => {
      remaining--;
      [p1, p2].forEach((uid) => {
        const conn = playerConnections.get(uid);
        if (conn?.readyState === 1) {
          conn.send(JSON.stringify({ type: 'TIMER_TICK', remaining }));
        }
      });
      if (remaining <= 0) clearInterval(tickInterval);
    }, 1000);
  }
  
  export async function launchGame(p1, p2) {
    const letters = generateRandomLetters(7);
    const game = await createGame(p1, p2, letters);
    registerGame(game.id, p1, p2);
    activeGameStatus.set(game.id, true);
  
    const timer = setTimeout(async () => {
      activeGameStatus.set(game.id, false);
      activeGameTimers.delete(game.id);
      const result = await finalizeGame(game.id);
      [p1, p2].forEach((uid) => {
        const conn = playerConnections.get(uid);
        if (conn?.readyState === 1) {
          conn.send(JSON.stringify({ type: 'GAME_OVER', scores: result.scores, winnerId: result.winnerId }));
        }
      });
    }, GAME_DURATION_SECONDS * 1000);
  
    activeGameTimers.set(game.id, timer);
    startGameTimer(game.id, GAME_DURATION_SECONDS, p1, p2);
  
    [p1, p2].forEach((uid) => {
      const conn = playerConnections.get(uid);
      if (conn?.readyState === 1) {
        conn.send(JSON.stringify({
          type: 'GAME_START',
          gameId: game.id,
          opponentId: uid === p1 ? p2 : p1,
          letters,
          endsAt: game.endsAt
        }));
      }
    });
  }
  
  export async function handle(msg, ws) {
    const { type, userId, gameId, word } = msg;
  
    if (type === 'JOIN_QUEUE') {
      matchmakingQueue.push(userId);
      if (matchmakingQueue.length >= 2) {
        const [p1, p2] = matchmakingQueue.splice(0, 2);
        await launchGame(p1, p2);
      }
    }
  
    if (type === 'SUBMIT_WORD') {
      if (!activeGameStatus.get(gameId)) {
        ws.send(JSON.stringify({ type: 'WORD_SUBMISSION_RESULT', success: false, reason: 'Game has ended' }));
        return;
      }
  
      const result = await submitWord({ gameId, userId, word });
      ws.send(JSON.stringify({ type: 'WORD_SUBMISSION_RESULT', ...result }));
  
      if (result.success) {
        const opponentId = getOpponentFromGame(gameId, userId);
        const opponentSocket = playerConnections.get(opponentId);
        opponentSocket?.send(JSON.stringify({ type: 'OPPONENT_SUBMITTED', word, userId }));
      }
    }
  }
  