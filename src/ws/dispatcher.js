import * as pvp from './handlers/pvp.js';
import * as practice from './handlers/practice.js';
import * as friends from './handlers/friends.js';

export async function dispatch(msg, ws, userId) {
  const type = msg.type;
  console.log(`🚦 [Dispatcher] Received ${type} message from user ${userId}`);

  try {
    // Handle practice-related messages first
    if (type.startsWith('PRACTICE_') || type === 'START_PRACTICE') {
      console.log(`🎯 [Dispatcher] Routing "${type}" to practice handler`);
      const startTime = Date.now();
      await practice.handle(msg, ws);
      console.log(`⏱️ [Dispatcher] Practice handler processed ${type} in ${Date.now() - startTime}ms`);
      return;
    }

    // Then handle PVP messages
    if (type.startsWith('SUBMIT_') || type === 'JOIN_QUEUE' || type === 'LEAVE_QUEUE' ||
      type === 'JOIN_GAME' || type === 'LEAVE_GAME' || type === 'HELLO' ||
      type === 'GET_STATUS' || type === 'GET_GAME_STATE' || type === 'PING') {
      console.log(`🎯 [Dispatcher] Routing "${type}" to PVP handler`);
      const startTime = Date.now();
      await pvp.handle(msg, ws);
      console.log(`⏱️ [Dispatcher] PVP handler processed ${type} in ${Date.now() - startTime}ms`);
      return;
    }

    // Finally handle friend-related messages
    if (type.startsWith('FRIEND_')) {
      console.log(`🎯 [Dispatcher] Routing "${type}" to friends handler`);
      const startTime = Date.now();
      await friends.handle(msg, ws);
      console.log(`⏱️ [Dispatcher] Friends handler processed ${type} in ${Date.now() - startTime}ms`);
      return;
    }

    console.error(`❌ [Dispatcher] No handler found for message type: "${type}"`);
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: `Unsupported message type: ${type}`
    }));
  } catch (error) {
    console.error(`❌ [Dispatcher] Error processing ${type} message:`, error);
    try {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'Server error processing your request'
      }));
    } catch (sendError) {
      console.error(`❌ [Dispatcher] Failed to send error response:`, sendError);
    }
  }
}
