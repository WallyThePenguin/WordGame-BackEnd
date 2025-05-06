// /src/server.js
import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import app from './app.js';
import { PrismaClient } from '@prisma/client';
import { initWebSocketServer } from './ws/wsServer.js';
import { recoverGamesOnStartup } from './services/gameStateManager.js';
import { practiceSessions } from './ws/state/connectionMaps.js';
import { loadDictionaries, getDictionaryStats } from './utils/wordValidator.js';

const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Function to test DB connection
async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL via Prisma.');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
    return false;
  }
}

// Function to clear practice sessions on startup
async function clearPracticeSessions() {
  try {
    practiceSessions.clear();
    console.log('🧹 Cleared existing practice sessions');
  } catch (error) {
    console.error('❌ Failed to clear practice sessions:', error);
  }
}

// Only start server if DB connection is successful
(async () => {
  const [dbReady, dictReady] = await Promise.all([
    testDatabaseConnection(),
    loadDictionaries()
  ]);

  if (!dbReady || !dictReady) {
    console.error('❌ Server startup failed due to initialization issues');
    process.exit(1); // Exit with failure code
  }

  // Log dictionary statistics
  const stats = getDictionaryStats();
  console.log('📚 Dictionary Statistics:', stats);

  await Promise.all([
    recoverGamesOnStartup(),
    clearPracticeSessions()
  ]);
  console.log('🔄 Recovered active games and cleared practice sessions on startup.');

  const server = http.createServer(app);
  initWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`🚀 HTTP + WebSocket server running on port ${PORT}`);
  });
})();

