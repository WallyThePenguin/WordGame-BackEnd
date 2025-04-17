import { playerConnections, friendInvites } from '../state/connectionMaps.js';
import { ensureUserExists } from '../../utils/userUtils.js';
import { launchGame } from './pvp.js'; // or move shared to /ws/utils

export async function handle(msg) {
  const { type, fromUserId, toUserId } = msg;

  if (type === 'FRIEND_INVITE') {
    const inviteId = `${fromUserId}->${toUserId}`;
    if (friendInvites.has(inviteId)) {
      clearTimeout(friendInvites.get(inviteId).timeoutRef);
    }

    const timeoutRef = setTimeout(() => {
      const fromSocket = playerConnections.get(fromUserId);
      fromSocket?.send(JSON.stringify({ type: 'FRIEND_INVITE_EXPIRED', toUserId }));
      friendInvites.delete(inviteId);
    }, 60 * 60 * 1000);

    friendInvites.set(inviteId, { from: fromUserId, to: toUserId, timeoutRef });

    const toSocket = playerConnections.get(toUserId);
    toSocket?.send(JSON.stringify({ type: 'FRIEND_INVITE_RECEIVED', fromUserId }));
  }

  if (type === 'FRIEND_INVITE_ACCEPTED') {
    const inviteId = `${fromUserId}->${toUserId}`;
    if (friendInvites.has(inviteId)) {
      clearTimeout(friendInvites.get(inviteId).timeoutRef);
      friendInvites.delete(inviteId);
    }

    await ensureUserExists(fromUserId);
    await ensureUserExists(toUserId);
    await launchGame(fromUserId, toUserId);
  }
}
