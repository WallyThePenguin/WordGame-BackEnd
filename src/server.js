// /src/server.js
import dotenv from 'dotenv';
dotenv.config();
import http from 'http';
import app from './app.js';
import { PrismaClient } from '@prisma/client';
import { initWebSocketServer } from './ws/wsServer.js';


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

// Only start server if DB connection is successful
(async () => {
  const dbReady = await testDatabaseConnection();
  if (!dbReady) {
    process.exit(1); // Exit with failure code
  }

  const server = http.createServer(app);
  initWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`🚀 HTTP + WebSocket server running on port ${PORT}`);
  });
})();

