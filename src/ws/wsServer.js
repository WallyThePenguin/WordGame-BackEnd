import { WebSocketServer } from 'ws';
import { dispatch } from './dispatcher.js';
import { playerConnections } from './state/connectionMaps.js';

export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      console.log(`📨 [WS] Message received: ${message}`);
      const msg = JSON.parse(data);
      const userId = msg.userId;

      if (userId) {
        playerConnections.set(userId, ws);
        await dispatch(msg, ws, userId);
      }
    });

    ws.on('close', () => {
      for (const [userId, conn] of playerConnections.entries()) {
        if (conn === ws) playerConnections.delete(userId);
      }
    });
  });

  console.log('WebSocket server initialized.');
}
