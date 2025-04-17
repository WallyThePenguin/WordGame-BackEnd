import express from 'express';
import { createGame } from '../services/gameService.js';
import { submitWord } from '../services/wordService.js';

const router = express.Router();

router.post('/create', async (req, res) => {
  const { playerOneId, playerTwoId, letters } = req.body;
  const game = await createGame(playerOneId, playerTwoId, letters);
  res.json(game);
});

router.post('/:gameId/submit', async (req, res) => {
  const { userId, word } = req.body;
  try {
    const result = await submitWord({ gameId: req.params.gameId, userId, word });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
