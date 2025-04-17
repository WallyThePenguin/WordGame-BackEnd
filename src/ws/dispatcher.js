import * as pvp from './handlers/pvp.js';
import * as practice from './handlers/practice.js';
import * as friends from './handlers/friends.js';

export async function dispatch(msg, ws, userId) {
  const type = msg.type;

  if (type.startsWith('SUBMIT_') || type === 'JOIN_QUEUE') {
    return pvp.handle(msg, ws);
  }

  if (type.startsWith('PRACTICE_') || type === 'START_PRACTICE') {
    return practice.handle(msg, ws);
  }

  if (type.startsWith('FRIEND_')) {
    return friends.handle(msg, ws);
  }
}
