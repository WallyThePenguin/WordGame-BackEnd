export const playerConnections = new Map();  // userId → WebSocket
export const matchmakingQueue = [];
export const activeGameStatus = new Map();   // gameId → true/false
export const activeGameTimers = new Map();   // gameId → setTimeout ref
export const friendInvites = new Map();      // inviteId → { from, to, timeoutRef }
export const practiceSessions = new Map();   // userId → { score, words, ... }
