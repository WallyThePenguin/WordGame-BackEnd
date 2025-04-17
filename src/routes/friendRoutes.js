import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// 🧑‍🤝‍🧑 List accepted friends
router.get('/:userId', async (req, res) => {
  const userId = req.params.userId;

  const friends = await prisma.friendship.findMany({
    where: {
      userId,
      status: 'ACCEPTED'
    },
    include: {
      friend: true
    }
  });

  res.json(friends.map(f => f.friend));
});

// ✉️ Send friend request
router.post('/request', async (req, res) => {
  const { userId, friendId } = req.body;

  if (userId === friendId) return res.status(400).json({ error: "Can't friend yourself" });

  try {
    const exists = await prisma.friendship.findUnique({
      where: {
        userId_friendId: { userId, friendId }
      }
    });

    if (exists) return res.status(400).json({ error: 'Already requested or friends' });

    await prisma.friendship.create({
      data: { userId, friendId, status: 'PENDING' }
    });

    res.json({ message: 'Friend request sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Accept request
router.post('/accept', async (req, res) => {
  const { userId, friendId } = req.body;

  try {
    const request = await prisma.friendship.findUnique({
      where: {
        userId_friendId: { userId: friendId, friendId: userId }
      }
    });

    if (!request || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'No pending request found' });
    }

    // Update original request
    await prisma.friendship.update({
      where: { userId_friendId: { userId: friendId, friendId: userId } },
      data: { status: 'ACCEPTED' }
    });

    // Create reverse entry
    await prisma.friendship.create({
      data: {
        userId,
        friendId,
        status: 'ACCEPTED'
      }
    });

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
