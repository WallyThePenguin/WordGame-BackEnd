import { WebSocketServer } from 'ws';
import { dispatch } from './dispatcher.js';
import { playerConnections, socketUserMap, matchmakingQueue } from './state/connectionMaps.js';
import { handleDisconnect } from './handlers/pvp.js';

export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  console.log('📡 WebSocket server initialized and waiting for connections');

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔌 [WS] New connection from ${clientIp}`);

    // Store the userId once identified to handle disconnections
    let connectedUserId = null;

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        const userId = msg.userId;
        const type = msg.type;

        console.log(`📨 [WS] Message received: ${type} from user ${userId}`, {
          type,
          userId,
          payload: JSON.stringify(msg).length > 500
            ? JSON.stringify(msg).substring(0, 500) + '...'
            : msg
        });

        if (userId) {
          // Associate this websocket with the userId
          if (!connectedUserId) {
            connectedUserId = userId;
            console.log(`🔑 [WS] First message from user ${userId}, associating connection`);

            // Store websocket in userMap
            socketUserMap.set(ws, userId);
          } else if (connectedUserId !== userId) {
            console.warn(`⚠️ [WS] User ID changed on connection from ${connectedUserId} to ${userId}`);

            // Update the userId for this connection
            connectedUserId = userId;
            socketUserMap.set(ws, userId);
          }

          console.log(`📝 [WS] Registering connection for user ${userId}`);
          playerConnections.set(userId, ws);

          console.log(`⏩ [WS] Dispatching ${type} to handler`);
          await dispatch(msg, ws, userId);

          console.log(`✅ [WS] Completed handling ${type} for user ${userId}`);
        } else {
          console.warn(`⚠️ [WS] Message without userId received:`, msg);
        }
      } catch (error) {
        console.error(`❌ [WS] Error processing message:`, error);
        console.error(`❌ [WS] Message data:`, data.toString());
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 [WS] Connection closed with code ${code}, reason: ${reason || 'No reason provided'}`);

      // Get the userId associated with this socket
      const userId = socketUserMap.get(ws);

      if (userId) {
        console.log(`🔍 [WS] Closing connection for user ${userId}`);

        // Remove the socket-to-user mapping
        socketUserMap.delete(ws);

        // Only remove user from player connections if this was their current socket
        const currentSocket = playerConnections.get(userId);
        if (currentSocket === ws) {
          console.log(`🗑️ [WS] Removing primary connection for user ${userId}`);
          playerConnections.delete(userId);

          // Check if user has other connections
          let hasOtherConnections = false;
          for (const [socket, id] of socketUserMap.entries()) {
            if (id === userId) {
              console.log(`🔄 [WS] User ${userId} has another connection, updating primary connection`);
              playerConnections.set(userId, socket);
              hasOtherConnections = true;
              break;
            }
          }

          // If no other connections found, handle disconnection
          if (!hasOtherConnections) {
            console.log(`🔍 [WS] User ${userId} has no other connections, handling disconnection`);

            // Handle queue disconnection
            handleDisconnect(userId);
          } else {
            console.log(`✅ [WS] User ${userId} remains connected on another socket`);
          }
        } else {
          console.log(`ℹ️ [WS] Non-primary connection closed for user ${userId}`);
        }
      } else {
        console.log(`ℹ️ [WS] Closed connection was not associated with any user`);
      }
    });

    ws.on('error', (error) => {
      console.error(`❌ [WS] WebSocket error:`, error);
    });
  });

  // Log connection stats every 30 seconds
  setInterval(() => {
    // Count unique users
    const uniqueUsers = new Set([...socketUserMap.values()]);

    console.log(`📊 [WS Stats] Active connections: ${socketUserMap.size}, Unique users: ${uniqueUsers.size}, Queue size: ${matchmakingQueue.length}`);
    console.log(`🧑‍🤝‍🧑 [WS Stats] Connected users: ${Array.from(uniqueUsers).join(', ')}`);
    console.log(`⏳ [WS Stats] Queue users: ${matchmakingQueue.join(', ')}`);
  }, 30000);
}
