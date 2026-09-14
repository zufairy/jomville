import { EventEmitter } from 'node:events';

/** KitchenRoom emits 'done' with its roomId on dispose so the world lobby can reopen that crew. */
export const rounds = new EventEmitter();
rounds.setMaxListeners(0);
