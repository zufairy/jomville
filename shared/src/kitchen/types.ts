export type Ingredient = 'tomato' | 'lettuce' | 'onion' | 'mushroom';
export type Dish = 'soup_tomato' | 'soup_onion' | 'soup_mushroom' | 'salad' | 'salad_tomato';

export type IngItem = { kind: 'ing'; ing: Ingredient; chopped: boolean };
export type PlateItem = { kind: 'plate'; soup: Ingredient | null; parts: Ingredient[] };
/** cook: seconds cooked (capped at COOK_PER_ING × contents); over: seconds past done; burnt: ruined */
export type PotItem = { kind: 'pot'; contents: Ingredient[]; cook: number; over: number; burnt: boolean };
export type Item = IngItem | PlateItem | PotItem;

export type StationKind = 'counter' | 'crate' | 'board' | 'stove' | 'plates' | 'window' | 'bin' | 'return';

export interface Station {
  kind: StationKind;
  x: number;
  y: number;
  item: Item | null;
  /** crate ingredient */
  ing: Ingredient | null;
  /** chopping progress in seconds (board) */
  chop: number;
  /** clean plates available (plates, return) */
  count: number;
  /** state.rev when this station last changed */
  v: number;
}

export interface Chef {
  id: string;
  x: number;
  y: number;
  /** facing unit vector */
  fx: number;
  fy: number;
  held: Item | null;
  /** seconds of dash left, and cooldown */
  dash: number;
  dashCd: number;
  /** last input seq applied */
  seq: number;
  chopping: boolean;
}

export interface KitchenInput {
  seq: number;
  /** stick/keys in [-1, 1]; +y is down the screen */
  mx: number;
  my: number;
  /** press edge: pick up / put down */
  grab: boolean;
  /** held: chop */
  use: boolean;
  /** press edge */
  dash: boolean;
}

export interface Order {
  id: number;
  dish: Dish;
  left: number;
  total: number;
}

export interface FloorItem {
  id: number;
  x: number;
  y: number;
  item: Item;
}

export interface LevelDef {
  id: string;
  name: string;
  /**
   * '#' wall, '.' floor, '1'-'4' spawn (floor), 'C' counter, 'T' tomato crate,
   * 'L' lettuce crate, 'O' onion crate, 'M' mushroom crate, 'B' chopping board,
   * 'S' stove (starts with a pot), 'P' plate stack, 'W' serving window, 'X' bin, 'R' plate return
   */
  rows: string[];
  menu: Dish[];
  /** score thresholds for 1, 2, 3 stars */
  stars: [number, number, number];
  plates: number;
}

export interface ParsedLevel {
  w: number;
  h: number;
  solid: boolean[];
  stations: Station[];
  spawns: Array<{ x: number; y: number }>;
}

export interface KitchenState {
  level: string;
  w: number;
  h: number;
  solid: boolean[];
  stations: Station[];
  spawns: Array<{ x: number; y: number }>;
  chefs: Record<string, Chef>;
  floor: FloorItem[];
  orders: Order[];
  /** seconds until each served plate comes back */
  returns: number[];
  roundTime: number;
  time: number;
  tick: number;
  nextOrderIn: number;
  orderSeq: number;
  floorSeq: number;
  score: number;
  streak: number;
  served: number;
  failed: number;
  rng: number;
  over: boolean;
  /** change counter; stations carry v, orders/floor carry ordersV/floorV */
  rev: number;
  ordersV: number;
  floorV: number;
}

export type KitchenEvent =
  | { type: 'served'; chef: string; dish: Dish; points: number; streak: number }
  | { type: 'rejected'; chef: string }
  | { type: 'expired'; dish: Dish }
  | { type: 'chopped'; chef: string }
  | { type: 'burnt'; x: number; y: number }
  | { type: 'end'; score: number; stars: number; served: number; failed: number };

export interface ChefSnap {
  id: string;
  x: number;
  y: number;
  fx: number;
  fy: number;
  held: Item | null;
  chop: boolean;
  dash: boolean;
}

export interface StationSnap {
  i: number;
  item: Item | null;
  chop: number;
  count: number;
}

export interface KitchenSnap {
  tick: number;
  time: number;
  score: number;
  streak: number;
  over: boolean;
  /** chef id -> last input seq the server applied */
  acks: Record<string, number>;
  chefs: ChefSnap[];
  stations?: StationSnap[];
  orders?: Order[];
  floor?: FloorItem[];
  full?: true;
}
