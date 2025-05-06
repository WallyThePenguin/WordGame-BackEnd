import * as pvp from './handlers/pvp.js';
import * as practice from './handlers/practice.js';
import * as friends from './handlers/friends.js';

export async function dispatch(msg, ws, userId) {
  const type = msg.type;

  // Handle practice-related messages first
  if (type.startsWith('PRACTICE_') || type === 'START_PRACTICE') {
    console.log('📨 [Dispatcher] Routing to practice handler:', type);
    return practice.handle(msg, ws);
  }

  // Then handle PVP messages
  if (type.startsWith('SUBMIT_') || type === 'JOIN_QUEUE') {
    console.log('📨 [Dispatcher] Routing to PVP handler:', type);
    return pvp.handle(msg, ws);
  }

  // Finally handle friend-related messages
  if (type.startsWith('FRIEND_')) {
    console.log('📨 [Dispatcher] Routing to friends handler:', type);
    return friends.handle(msg, ws);
  }

  console.log('❌ [Dispatcher] No handler found for message type:', type);
}
