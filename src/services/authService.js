import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY = '30d';

export async function registerUser({ username, email, password }) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] }
  });
  if (existing) throw new Error('User already exists');

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash: hash,
      lastLogin: new Date()
    }
  });

  const { accessToken, refreshToken } = generateTokens(user);
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      dailyStreak: user.dailyStreak,
      lastLogin: user.lastLogin,
      winStreak: user.winStreak,
      totalWins: user.totalWins,
      totalLosses: user.totalLosses,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    },
    accessToken,
    refreshToken
  };
}

export async function loginUser({ email, password }) {
  console.log('Attempting login for email:', email);
  const user = await prisma.user.findUnique({ where: { email } });
  console.log('User found:', user ? 'yes' : 'no');

  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  console.log('Password valid:', valid);
  if (!valid) throw new Error('Invalid credentials');

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() }
  });

  const { accessToken, refreshToken } = generateTokens(user);
  console.log('Tokens generated successfully');

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      dailyStreak: user.dailyStreak,
      lastLogin: user.lastLogin,
      winStreak: user.winStreak,
      totalWins: user.totalWins,
      totalLosses: user.totalLosses,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    },
    accessToken,
    refreshToken
  };
}

export async function refreshToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    return {
      accessToken,
      refreshToken: newRefreshToken
    };
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken, refreshToken };
}
