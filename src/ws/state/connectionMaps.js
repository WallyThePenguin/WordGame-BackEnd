// Map userId → WebSocket
export const playerConnections = new Map();

// Map WebSocket → userId (for handling disconnects)
export const socketUserMap = new Map();

// Track users in matchmaking queue by userId
export const matchmakingQueue = [];

// Track active game status by gameId
export const activeGameStatus = new Map();   // gameId → true/false

// Track game timers by gameId
export const activeGameTimers = new Map();   // gameId → setTimeout ref

// Track friend invites
export const friendInvites = new Map();      // inviteId → { from, to, timeoutRef }

// Track practice sessions by userId
export const practiceSessions = new Map();   // userId → { score, words, ... }
