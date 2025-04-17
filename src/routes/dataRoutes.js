import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// 🔍 Get a game's full data
router.get('/game/:id', async (req, res) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: {
        playerOne: true,
        playerTwo: true,
        winner: true,
        submissions: true
      }
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👤 Get a user's info
router.get('/user/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔄 Get the opponent of a user in a game
router.get('/game/:gameId/opponent/:userId', async (req, res) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.gameId },
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const { playerOneId, playerTwoId } = game;
    const opponentId = req.params.userId === playerOneId ? playerTwoId
                    : req.params.userId === playerTwoId ? playerOneId
                    : null;

    if (!opponentId) return res.status(400).json({ error: 'User not part of this game' });

    const opponent = await prisma.user.findUnique({
      where: { id: opponentId }
    });

    res.json(opponent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👫 Get both players of a game
router.get('/game/:gameId/players', async (req, res) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.gameId },
      include: {
        playerOne: true,
        playerTwo: true
      }
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    res.json({ playerOne: game.playerOne, playerTwo: game.playerTwo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📜 Get full game history for a user
router.get('/user/:id/history', async (req, res) => {
    try {
      const userId = req.params.id;
  
      const games = await prisma.game.findMany({
        where: {
          OR: [
            { playerOneId: userId },
            { playerTwoId: userId }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          playerOne: true,
          playerTwo: true,
          winner: true,
          submissions: true
        }
      });
  
      res.json(games);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });


  router.get('/user/:id/stats', async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        username: true,
        totalWins: true,
        totalLosses: true,
        winStreak: true,
        dailyStreak: true
      }
    });
  
    if (!user) return res.status(404).json({ error: 'User not found' });
  
    const totalGames = user.totalWins + user.totalLosses;
    const winRate = totalGames > 0 ? (user.totalWins / totalGames * 100).toFixed(2) : '0.00';
  
    res.json({ ...user, totalGames, winRate: `${winRate}%` });
  });
  
  

export default router;
