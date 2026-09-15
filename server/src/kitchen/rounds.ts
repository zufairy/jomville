import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

/**
 * KitchenRoom -> world lobby: 'ended' (roomId) when time is up, 'left' (roomId, userId) when a
 * player is gone for good, 'done' (roomId) on dispose.
 */
export const rounds = new EventEmitter();
rounds.setMaxListeners(0);

/**
 * Per-process secret so `kitchen` rooms can only be created by this server's own lobby
 * (via GameRoom.setupKitchen), never directly by a client calling client.create('kitchen', ...).
 */
export const ROUND_KEY = randomBytes(24).toString('hex');

export function isRoundKey(key: unknown): boolean {
  return typeof key === 'string' && key.length === ROUND_KEY.length && key === ROUND_KEY;
}
