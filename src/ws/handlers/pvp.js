import {
  playerConnections, matchmakingQueue
} from '../state/connectionMaps.js';
import { createGame } from '../../services/gameService.js';
import { generateRandomLetters, getOpponentFromGame } from '../../utils/wsHelpers.js';
import { submitWord } from '../../services/wordService.js';
import { updateComboState, resetComboState } from '../../utils/comboUtil.js';
import { isGameActive, registerGame } from '../../services/gameStateManager.js';

export async function launchGame(p1, p2) {
  const letters = generateRandomLetters(7);
  const game = await createGame(p1, p2, letters);

  registerGame(game.id, p1, p2, game.endsAt); // memory + timer registration

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
    if (!isGameActive(gameId)) {
      ws.send(JSON.stringify({ type: 'WORD_SUBMISSION_RESULT', success: false, reason: 'Game has ended' }));
      return;
    }

    const result = await submitWord({ gameId, userId, word });
    ws.send(JSON.stringify({ type: 'WORD_SUBMISSION_RESULT', ...result }));

    if (result.success) {
      const { totalScore, bonusScore, comboLevel } = await updateComboState(gameId, userId, result.score || 0);
      ws.send(JSON.stringify({
        type: 'COMBO_BONUS',
        word,
        comboLevel,
        bonusScore,
        totalScore
      }));

      const opponentId = getOpponentFromGame(gameId, userId);
      const opponentSocket = playerConnections.get(opponentId);
      opponentSocket?.send(JSON.stringify({ type: 'OPPONENT_SUBMITTED', word, userId }));
    } else {
      await resetComboState(gameId, userId);
      ws.send(JSON.stringify({
        type: 'COMBO_RESET',
        reason: 'invalid_or_duplicate',
        word
      }));
    }
  }
}

  
  