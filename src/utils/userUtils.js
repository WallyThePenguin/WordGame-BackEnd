// /src/utils/userUtils.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Ensures a user exists by their ID. If not, creates a placeholder guest user.
 * Used for PvP, friend invite, practice, etc.
 */
export async function ensureUserExists(userId) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: userId,
        username: `Guest-${userId}`,
        email: `${userId}@guest.test`,
        passwordHash: 'placeholder' // Guest accounts only
      }
    });
  }
}
