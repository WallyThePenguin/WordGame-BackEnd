import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// 🏆 PvP Wins Leaderboard
router.get('/wins', async (req, res) => {
  const top = await prisma.user.findMany({
    orderBy: { totalWins: 'desc' },
    take: 10,
    select: { id: true, username: true, totalWins: true }
  });
  res.json(top);
});

// 🔥 Win Streak Leaderboard
router.get('/streaks', async (req, res) => {
  const top = await prisma.user.findMany({
    orderBy: { winStreak: 'desc' },
    take: 10,
    select: { id: true, username: true, winStreak: true }
  });
  res.json(top);
});

// 🎯 Practice Best Score Leaderboard
router.get('/practice', async (req, res) => {
  const top = await prisma.practiceStat.findMany({
    orderBy: { bestScore: 'desc' },
    take: 10,
    include: {
      user: {
        select: { id: true, username: true }
      }
    }
  });

  const result = top.map(stat => ({
    userId: stat.user.id,
    username: stat.user.username,
    bestScore: stat.bestScore
  }));

  res.json(result);
});

export default router;
