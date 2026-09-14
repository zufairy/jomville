export const K_TICK_HZ = 30;
export const K_DT = 1 / K_TICK_HZ;
export const K_SNAP_HZ = 20;

export const CHEF_R = 0.35;
export const CHEF_SPEED = 4.5;
/** stick deflection below this is ignored */
export const DEADZONE = 0.2;
export const DASH_TIME = 0.18;
export const DASH_MULT = 3;
export const DASH_COOLDOWN = 1;
/** how far in front of a chef grab/use reaches, in tiles */
export const REACH = 0.75;
export const FLOOR_PICK_RADIUS = 0.8;

export const CHOP_TIME = 2;
export const COOK_PER_ING = 3;
export const POT_MAX = 3;
export const BURN_AFTER = 8;
export const PLATE_RETURN = 5;

export const ROUND_TIME = 180;
export const FIRST_ORDER = 2;
export const ORDER_EVERY = 12;
export const ORDER_TIME = 60;
export const ORDER_WARN = 15;
export const MAX_ORDERS = 5;
export const SERVE_BASE = 20;
export const TIP_MAX = 8;
export const STREAK_MAX = 4;
export const EXPIRE_PENALTY = 10;

export const CREW_MAX = 4;
/** order interval multiplier by crew size (index = size) */
export const CREW_SCALE = [1.6, 1.6, 1.25, 1.1, 1.0] as const;

export const KITCHEN_COINS_PER_STAR = 10;
export const KITCHEN_COINS_HOURLY_CAP = 150;
export const RECONNECT_SECONDS = 20;
