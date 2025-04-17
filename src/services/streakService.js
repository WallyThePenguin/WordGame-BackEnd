import { PrismaClient } from '@prisma/client';
import { isSameDay } from 'date-fns';

const prisma = new PrismaClient();

export async function updateDailyLoginStreak(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const today = new Date();

  const last = user.lastLogin;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let newStreak = 1;

  if (last) {
    if (isSameDay(today, last)) {
      return; // Already counted today
    } else if (isSameDay(last, yesterday)) {
      newStreak = user.dailyStreak + 1;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      dailyStreak: newStreak,
      lastLogin: today
    }
  });
}
