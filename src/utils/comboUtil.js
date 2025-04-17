import redis from "../redis/redisClient.js";
import { COMBO_WINDOW_SECONDS, MULTIPLIER_INCREMENT, MAX_MULTIPLIER } from "../config/gameConfig.js";
import { json } from "express";
const comboKey = (userId, gameId) => `match:${gameId}:player:${userId}:combo`;
const COMBO_WINDOW = COMBO_WINDOW_SECONDS * 1000

export async function getComboState(gameId, userId) {
  const raw = await redis.get(comboKey(userId, gameId));
  return raw ? json.parse(raw) : null;
}

export async function updateComboState(gameId, userId, baseScore){
    const now = Date.now();
    const comboState = await getComboState(gameId, userId);
    const diff = now - comboState.lastWordTimestamp;
    comboState.currntComboLevel = diff <= COMBO_WINDOW ? comboState.currentComboLevel + 1 : 0;
    comboState.lastWordTimestamp = now;
    const multiplier = Math.min(1+comboState.currentComboLevel * MULTIPLIER_INCREMENT, MAX_MULTIPLIER)
    const totalScore = Math.floor(baseScore * multiplier);
    const bonusScore = totalScore - baseScore;
    await redis.set(comboKey(userId, gameId), JSON.stringify(comboState), {EX: COMBO_WINDOW_SECONDS + 1}); // +1 to ensure it doesn't expire mid-game
    return{
        currentComboLevel: comboState.currentComboLevel,
        totalScore,
        bonusScore
    };
}
export async function resetComboState(matchId, userId) {
    const comboState = { lastWordTimestamp: 0, currentComboLevel: 0 };
    await redis.set(
      `match:${matchId}:player:${userId}:combo`,
      JSON.stringify(comboState),
      { EX: 600 }
    );
  }