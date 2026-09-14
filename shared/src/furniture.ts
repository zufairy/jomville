import type { InteractionKind } from './interactions';
import { Grid, makeGrid } from './grid';

export type FurnitureKind =
  | 'block'
  | 'rug'
  | 'plant'
  | 'lamp'
  | 'chair'
  | 'table'
  | 'bed'
  | 'shelf'
  | 'tree'
  | 'bush'
  | 'bench'
  | 'fountain'
  | 'flowers'
  | 'path'
  | 'pond'
  | 'lamppost'
  | 'picnic'
  | 'sign'
  | 'sofa'
  | 'stool'
  | 'armchair'
  | 'tv'
  | 'jukebox'
  | 'campfire'
  | 'disco'
  | 'aquarium'
  | 'arcade'
  | 'neon'
  | 'vending'
  | 'hottub'
  | 'deck'
  | 'stall'
  | 'crate_stack'
  | 'umbrella'
  | 'loveseat'
  | 'love_meter'
  | 'pulley'
  | 'conveyor'
  | 'rope_post'
  | 'candle'
  | 'balloons'
  | 'rose_bush'
  | 'love_carpet'
  | 'lane_sign'
  | 'hedge'
  | 'pad'
  | 'arch'
  | 'torch'
  | 'glowtile'
  | 'lava_lamp'
  | 'pod_bed'
  | 'holo_desk'
  | 'server_rack'
  | 'holo_shelf'
  | 'rocket_model'
  | 'telescope'
  | 'orb_light'
  | 'alien_plant'
  | 'egg_chair'
  | 'rug_alien'
  | 'rug_saturn'
  | 'robot_dock'
  | 'hex_panel'
  | 'wall_art'
  | 'space_window'
  // sunset cove
  | 'cabana'
  | 'sun_lounger'
  | 'hammock'
  | 'tiki_bar'
  | 'surf_rack'
  | 'sandcastle'
  | 'flamingo_pool'
  | 'beach_ball'
  | 'shell_lamp'
  | 'boombox'
  | 'lifeguard_tower'
  | 'shore_foam'
  | 'beach_towel'
  // dream suite
  | 'canopy_bed'
  | 'vanity'
  | 'heart_chair'
  | 'cloud_sofa'
  | 'teddy_giant'
  | 'cake_stand'
  | 'boba_bar'
  | 'swing_chair'
  | 'heart_disco'
  | 'fluffy_rug'
  | 'star_lamp'
  | 'bunny_plush'
  | 'wall_dream'
  // wonder dome
  | 'carousel'
  | 'swing_ride'
  | 'teacup_ride'
  | 'drop_tower'
  | 'coaster_gate'
  | 'track_bed'
  | 'rattan_sofa'
  | 'rattan_pouf'
  | 'coffee_table'
  | 'bulb_tree'
  | 'potted_fern'
  | 'flower_basket'
  | 'popcorn_cart'
  | 'candy_cart'
  | 'ticket_booth'
  | 'claw_machine'
  | 'balloon_cart'
  | 'dancing_fountain'
  | 'park_lamp'
  | 'high_striker'
  | 'snack_bar'
  | 'park_bench'
  | 'brass_stanchion'
  | 'woven_rug'
  | 'queue_path'
  | 'wall_park'
  // game den
  | 'game_table'
  | 'game_chair'
  | 'bean_bag'
  | 'game_shelf'
  | 'trophy_case'
  | 'giant_dice'
  | 'chess_king'
  | 'pool_table'
  | 'dice_rug'
  | 'pixel_lamp'
  | 'wall_den'
  // casino
  | 'dicemaster'
  | 'holodice'
  | 'wheel_fortune'
  | 'dragon_egg'
  | 'throne'
  | 'felt_table'
  | 'chip_stack'
  | 'casino_carpet'
  | 'neon_casino'
  | 'slot_prop'
  | 'velvet_rope_gold'
  // trading room
  | 'egg_stack_2'
  | 'egg_stack_3'
  | 'egg_wall'
  | 'gold_patch'
  | 'leaf_hedge'
  | 'palm_planter'
  | 'gold_rail'
  | 'trade_sofa'
  | 'trading_banner';

export const FURNITURE_CATS = ['seating', 'tables', 'lights', 'fun', 'outdoor', 'decor', 'floor', 'casino'] as const;
export type FurnitureCat = (typeof FURNITURE_CATS)[number];

export type Rarity = 'common' | 'rare' | 'epic';

export interface FurnitureDef {
  id: string;
  name: string;
  kind: FurnitureKind;
  cat: FurnitureCat;
  /** footprint in tiles at rotation 0 (w along x, h along y) */
  w: number;
  h: number;
  /** visual height in px at 1x (cuboid height); 0 for flat items */
  tall: number;
  /** palette indices: [top/main, side/secondary] */
  colours: [number, number];
  /** rugs/paths can be walked over and have furniture on top */
  walkable: boolean;
  /** avatars can walk onto it and sit (chairs, benches, sofas) */
  sit: boolean;
  /** tap to switch on/off (lamps, tv, jukebox); state syncs to everyone */
  use: boolean;
  /** animation frame count (1 = static). Client renders these into a sprite sheet. */
  anim: number;
  /** shop price in coins; 0 = not sold (system décor) */
  price: number;
  rarity: Rarity;
  /** limited edition: only this many serials are ever sold */
  ltd?: number;
  /** chance furni behaviour on use (dice, wheel) */
  interaction?: InteractionKind;
  /** short flavour text for the item info window */
  blurb?: string;
}

interface Opts {
  walkable?: boolean;
  sit?: boolean;
  use?: boolean;
  anim?: number;
  rarity?: Rarity;
  ltd?: number;
  interaction?: InteractionKind;
  blurb?: string;
}

const def = (
  id: string,
  name: string,
  kind: FurnitureKind,
  cat: FurnitureCat,
  w: number,
  h: number,
  tall: number,
  colours: [number, number],
  price: number,
  o: Opts = {},
): FurnitureDef => ({
  id,
  name,
  kind,
  cat,
  w,
  h,
  tall,
  colours,
  price,
  walkable: o.walkable ?? false,
  sit: o.sit ?? false,
  use: o.use ?? false,
  anim: o.anim ?? 1,
  rarity: o.rarity ?? 'common',
  ...(o.ltd ? { ltd: o.ltd } : {}),
  ...(o.interaction ? { interaction: o.interaction } : {}),
  ...(o.blurb ? { blurb: o.blurb } : {}),
});

/**
 * The catalog. Ids are stable (they live in saved layouts and inventories).
 * Every item is purchasable unless price is 0.
 */
export const FURNITURE: FurnitureDef[] = [
  // ---- seating
  def('chair', 'chair', 'chair', 'seating', 1, 1, 22, [4, 5], 40, { sit: true }),
  def('stool', 'stool', 'stool', 'seating', 1, 1, 16, [16, 19], 25, { sit: true }),
  def('armchair', 'armchair', 'armchair', 'seating', 1, 1, 24, [8, 9], 90, { sit: true }),
  def('sofa', 'sofa', 'sofa', 'seating', 2, 1, 24, [13, 12], 160, { sit: true }),
  def('sofa_pink', 'pink sofa', 'sofa', 'seating', 2, 1, 24, [7, 6], 160, { sit: true }),
  def('bench', 'bench', 'bench', 'seating', 2, 1, 20, [19, 21], 80, { sit: true }),
  def('bed', 'bed', 'bed', 'seating', 1, 2, 14, [10, 11], 200, { sit: true }),
  def('hottub', 'hot tub', 'hottub', 'seating', 2, 2, 22, [24, 10], 900, { sit: true, anim: 6, rarity: 'epic' }),
  // ---- tables
  def('table', 'table', 'table', 'tables', 2, 1, 18, [19, 20], 60),
  def('table_round', 'café table', 'table', 'tables', 1, 1, 18, [27, 25], 45),
  def('picnic', 'picnic table', 'picnic', 'tables', 2, 2, 22, [19, 20], 150),
  // ---- lights
  def('lamp', 'lamp', 'lamp', 'lights', 1, 1, 42, [16, 26], 70, { use: true, anim: 4 }),
  def('lamppost', 'lamp post', 'lamppost', 'lights', 1, 1, 60, [30, 28], 110, { use: true, anim: 4 }),
  def('disco', 'disco ball', 'disco', 'lights', 1, 1, 78, [24, 25], 450, { use: true, anim: 8, rarity: 'rare' }),
  def('neon', 'neon sign', 'neon', 'lights', 2, 1, 44, [7, 13], 220, { use: true, anim: 6, rarity: 'rare' }),
  def('campfire', 'campfire', 'campfire', 'lights', 1, 1, 26, [18, 21], 120, { use: true, anim: 6 }),
  // ---- fun
  def('tv', 'tv', 'tv', 'fun', 2, 1, 36, [29, 26], 320, { use: true, anim: 8, rarity: 'rare' }),
  def('jukebox', 'jukebox', 'jukebox', 'fun', 1, 1, 52, [5, 17], 380, { use: true, anim: 8, rarity: 'rare' }),
  def('arcade', 'arcade cabinet', 'arcade', 'fun', 1, 1, 64, [11, 28], 600, { use: true, anim: 8, rarity: 'epic' }),
  def('aquarium', 'aquarium', 'aquarium', 'fun', 2, 1, 40, [31, 21], 340, { anim: 12, rarity: 'rare' }),
  def('vending', 'vending machine', 'vending', 'fun', 1, 1, 60, [5, 28], 260, { anim: 4 }),
  // ---- outdoor
  def('tree', 'tree', 'tree', 'outdoor', 1, 1, 70, [15, 20], 90, { anim: 8 }),
  def('tree_pink', 'blossom tree', 'tree', 'outdoor', 1, 1, 66, [6, 20], 130, { anim: 8 }),
  def('bush', 'bush', 'bush', 'outdoor', 1, 1, 22, [14, 15], 30, { anim: 8 }),
  def('plant', 'plant', 'plant', 'outdoor', 1, 1, 30, [15, 19], 35),
  def('fountain', 'fountain', 'fountain', 'outdoor', 3, 3, 30, [24, 10], 700, { anim: 8, rarity: 'epic' }),
  def('pond', 'pond', 'pond', 'outdoor', 2, 2, 0, [10, 11], 180, { anim: 8 }),
  def('umbrella', 'beach umbrella', 'umbrella', 'outdoor', 1, 1, 58, [4, 1], 95),
  def('stall', 'market stall', 'stall', 'outdoor', 2, 2, 60, [5, 1], 280, { rarity: 'rare' }),
  // ---- decor
  def('shelf', 'shelf', 'shelf', 'decor', 2, 1, 40, [20, 21], 85),
  def('crate', 'crate', 'block', 'decor', 1, 1, 20, [18, 19], 20),
  def('crate_stack', 'crate stack', 'crate_stack', 'decor', 1, 1, 44, [18, 19], 45),
  def('sign', 'sign', 'sign', 'decor', 1, 1, 34, [22, 20], 30),
  // ---- floor
  def('rug', 'rug', 'rug', 'floor', 2, 2, 0, [7, 6], 50, { walkable: true }),
  def('rug_small', 'small rug', 'rug', 'floor', 1, 1, 0, [12, 13], 20, { walkable: true }),
  def('rug_navy', 'navy rug', 'rug', 'floor', 2, 2, 0, [28, 11], 50, { walkable: true }),
  def('flowers', 'flower bed', 'flowers', 'floor', 1, 1, 0, [14, 7], 25, { walkable: true, anim: 4 }),
  def('path', 'stone path', 'path', 'floor', 1, 1, 0, [22, 23], 10, { walkable: true }),
  def('deck', 'wooden deck', 'deck', 'floor', 1, 1, 0, [19, 21], 12, { walkable: true }),
  // ---- park set 2: maze + activities
  def('tree_pine', 'pine tree', 'tree', 'outdoor', 1, 1, 84, [13, 21], 120, { anim: 8 }),
  def('tree_palm', 'palm tree', 'tree', 'outdoor', 1, 1, 90, [15, 19], 140, { anim: 8, rarity: 'rare' }),
  def('hedge', 'hedge', 'hedge', 'outdoor', 1, 1, 36, [15, 14], 20),
  def('arch', 'garden arch', 'arch', 'outdoor', 2, 1, 76, [27, 15], 180, { walkable: true, rarity: 'rare' }),
  def('torch', 'tiki torch', 'torch', 'lights', 1, 1, 56, [18, 20], 90, { use: true, anim: 6 }),
  def('pad_star', 'star pad', 'pad', 'floor', 1, 1, 0, [16, 17], 60, { walkable: true, anim: 8 }),
  def('pad_duel', 'duel pad', 'pad', 'floor', 2, 2, 0, [5, 4], 150, { walkable: true, anim: 8, rarity: 'rare' }),
  def('glowtile', 'dance tile', 'glowtile', 'floor', 1, 1, 0, [9, 13], 30, { walkable: true, anim: 8 }),
  // ---- love meter set
  def('loveseat', 'loveseat', 'loveseat', 'seating', 2, 1, 30, [7, 6], 260, { sit: true, anim: 6, rarity: 'rare' }),
  def('love_meter', 'love meter', 'love_meter', 'fun', 2, 1, 130, [7, 1], 1200, { anim: 12, rarity: 'epic' }),
  def('pulley', 'heart pulley', 'pulley', 'fun', 1, 1, 100, [26, 7], 520, { anim: 8, rarity: 'rare' }),
  def('conveyor', 'queue belt', 'conveyor', 'floor', 1, 1, 0, [26, 25], 30, { walkable: true, anim: 4 }),
  def('rope_post', 'velvet rope', 'rope_post', 'decor', 1, 1, 34, [17, 5], 35),
  def('candle', 'candles', 'candle', 'lights', 1, 1, 22, [1, 16], 40, { use: true, anim: 4 }),
  def('balloons', 'heart balloons', 'balloons', 'decor', 1, 1, 86, [7, 6], 90, { anim: 6 }),
  def('rose_bush', 'rose bush', 'rose_bush', 'outdoor', 1, 1, 26, [15, 5], 45),
  def('love_carpet', 'heart carpet', 'love_carpet', 'floor', 1, 1, 0, [6, 7], 15, { walkable: true }),
  def('sign_blue', 'blue line sign', 'lane_sign', 'decor', 1, 1, 56, [11, 10], 0),
  def('sign_pink', 'pink line sign', 'lane_sign', 'decor', 1, 1, 56, [7, 6], 0),
  // ---- rocket lab set
  def('lava_lamp', 'lava lamp', 'lava_lamp', 'lights', 1, 1, 50, [7, 9], 180, { use: true, anim: 12, rarity: 'rare' }),
  def('pod_bed', 'pod bed', 'pod_bed', 'seating', 2, 1, 30, [27, 11], 480, { sit: true, anim: 8, rarity: 'epic' }),
  def('holo_desk', 'holo desk', 'holo_desk', 'tables', 2, 1, 36, [28, 31], 560, { use: true, anim: 8, rarity: 'epic' }),
  def('server_rack', 'server rack', 'server_rack', 'fun', 1, 1, 86, [29, 13], 300, { anim: 8, rarity: 'rare' }),
  def('holo_shelf', 'hover shelf', 'holo_shelf', 'decor', 2, 1, 70, [24, 31], 340, { anim: 8, rarity: 'rare' }),
  def('rocket_model', 'rocket model', 'rocket_model', 'decor', 1, 1, 100, [27, 5], 420, { anim: 8, rarity: 'epic' }),
  def('telescope', 'telescope', 'telescope', 'fun', 1, 1, 60, [28, 17], 260, { anim: 8 }),
  def('orb_light', 'orb light', 'orb_light', 'lights', 1, 1, 70, [31, 9], 150, { use: true, anim: 8, rarity: 'rare' }),
  def('alien_plant', 'alien plant', 'alien_plant', 'outdoor', 1, 1, 46, [14, 8], 90, { anim: 8 }),
  def('egg_chair', 'egg chair', 'egg_chair', 'seating', 1, 1, 36, [27, 9], 190, { sit: true }),
  def('rug_alien', 'alien rug', 'rug_alien', 'floor', 2, 2, 0, [14, 15], 120, { walkable: true, anim: 8, rarity: 'rare' }),
  def('rug_saturn', 'saturn rug', 'rug_saturn', 'floor', 2, 2, 0, [28, 17], 120, { walkable: true }),
  def('robot_dock', 'robot dock', 'robot_dock', 'fun', 1, 1, 16, [26, 13], 200, { anim: 8 }),
  def('hex_panel', 'hex light panel', 'hex_panel', 'floor', 1, 1, 0, [28, 13], 40, { walkable: true, anim: 8 }),
  // wall pieces are walkable: they hang on the back wall above the floor tile
  def('art_planet', 'planet art', 'wall_art', 'decor', 2, 1, 92, [28, 8], 240, { walkable: true, anim: 12, rarity: 'rare' }),
  def('art_wave', 'synthwave art', 'wall_art', 'decor', 2, 1, 92, [9, 7], 240, { walkable: true, anim: 12, rarity: 'rare' }),
  def('art_rocket', 'launch poster', 'wall_art', 'decor', 2, 1, 92, [28, 4], 240, { walkable: true, anim: 12, rarity: 'rare' }),
  def('art_circuit', 'circuit art', 'wall_art', 'decor', 2, 1, 92, [29, 13], 200, { walkable: true, anim: 12 }),
  def('space_window', 'space window', 'space_window', 'decor', 3, 1, 96, [26, 31], 700, { walkable: true, anim: 12, rarity: 'epic' }),
  // ---- sunset cove set
  def('cabana', 'cabana', 'cabana', 'seating', 2, 2, 84, [27, 18], 620, { sit: true, anim: 8, rarity: 'epic' }),
  def('sun_lounger', 'sun lounger', 'sun_lounger', 'seating', 2, 1, 18, [27, 10], 140, { sit: true }),
  def('hammock', 'hammock', 'hammock', 'seating', 2, 1, 56, [3, 13], 260, { sit: true, anim: 8, rarity: 'rare' }),
  def('tiki_bar', 'tiki bar', 'tiki_bar', 'tables', 2, 2, 70, [19, 16], 720, { use: true, anim: 8, rarity: 'epic' }),
  def('surf_rack', 'surf rack', 'surf_rack', 'decor', 1, 1, 66, [21, 13], 220, { rarity: 'rare' }),
  def('sandcastle', 'sandcastle', 'sandcastle', 'decor', 1, 1, 40, [22, 5], 90, { anim: 8 }),
  def('flamingo_pool', 'flamingo pool', 'flamingo_pool', 'seating', 2, 2, 16, [10, 6], 380, { sit: true, anim: 8, rarity: 'rare' }),
  def('beach_ball', 'beach ball', 'beach_ball', 'fun', 1, 1, 30, [5, 11], 35, { anim: 8 }),
  def('shell_lamp', 'shell lamp', 'shell_lamp', 'lights', 1, 1, 44, [3, 6], 130, { use: true, anim: 6 }),
  def('boombox', 'boombox', 'boombox', 'fun', 1, 1, 22, [13, 29], 160, { use: true, anim: 8 }),
  def('lifeguard_tower', 'lifeguard tower', 'lifeguard_tower', 'decor', 2, 2, 110, [27, 5], 900, { anim: 8, rarity: 'epic' }),
  def('shore_foam', 'shore foam', 'shore_foam', 'floor', 1, 1, 0, [27, 31], 0, { walkable: true, anim: 8 }),
  def('beach_towel', 'beach towel', 'beach_towel', 'floor', 1, 2, 0, [7, 16], 45, { walkable: true }),
  // ---- dream suite set
  def('canopy_bed', 'canopy bed', 'canopy_bed', 'seating', 2, 2, 100, [6, 8], 980, { sit: true, anim: 8, rarity: 'epic' }),
  def('vanity', 'heart vanity', 'vanity', 'tables', 2, 1, 76, [27, 6], 540, { use: true, anim: 8, rarity: 'epic' }),
  def('heart_chair', 'heart chair', 'heart_chair', 'seating', 1, 1, 42, [7, 6], 160, { sit: true, rarity: 'rare' }),
  def('cloud_sofa', 'cloud sofa', 'cloud_sofa', 'seating', 2, 1, 30, [27, 31], 420, { sit: true, rarity: 'rare' }),
  def('teddy_giant', 'giant teddy', 'teddy_giant', 'decor', 1, 1, 62, [18, 6], 350, { anim: 8, rarity: 'rare' }),
  def('cake_stand', 'cake stand', 'cake_stand', 'tables', 1, 1, 52, [6, 12], 190, { anim: 8 }),
  def('boba_bar', 'boba bar', 'boba_bar', 'tables', 2, 1, 54, [8, 6], 460, { use: true, anim: 8, rarity: 'rare' }),
  def('swing_chair', 'flower swing', 'swing_chair', 'seating', 1, 1, 96, [27, 7], 480, { sit: true, anim: 8, rarity: 'epic' }),
  def('heart_disco', 'heart disco', 'heart_disco', 'lights', 1, 1, 100, [6, 24], 520, { use: true, anim: 8, rarity: 'epic' }),
  def('fluffy_rug', 'cloud rug', 'fluffy_rug', 'floor', 2, 2, 0, [27, 6], 140, { walkable: true, anim: 8 }),
  def('star_lamp', 'star lamp', 'star_lamp', 'lights', 1, 1, 48, [30, 8], 120, { use: true, anim: 8 }),
  def('bunny_plush', 'bunny plush', 'bunny_plush', 'decor', 1, 1, 32, [27, 6], 80, { anim: 8 }),
  // dream wall pieces hang on the back wall, walkable like the lab art
  def('neon_wings', 'neon wings', 'wall_dream', 'decor', 3, 1, 96, [27, 7], 800, { walkable: true, anim: 12, rarity: 'epic' }),
  def('photo_wall', 'photo wall', 'wall_dream', 'decor', 2, 1, 92, [6, 15], 320, { walkable: true, anim: 12, rarity: 'rare' }),
  def('heart_mirror', 'heart mirrors', 'wall_dream', 'decor', 2, 1, 92, [24, 7], 280, { walkable: true, anim: 12, rarity: 'rare' }),
  // ---- wonder dome set
  // rides: the sprite is only the platform; vehicles, riders and canopies are drawn live from the clock
  def('carousel', 'grand carousel', 'carousel', 'fun', 3, 3, 16, [17, 5], 0, { sit: true, anim: 8, rarity: 'epic' }),
  def('swing_ride', 'star swings', 'swing_ride', 'fun', 3, 3, 16, [17, 11], 0, { sit: true, anim: 8, rarity: 'epic' }),
  def('teacup_ride', 'teacup ride', 'teacup_ride', 'fun', 2, 2, 8, [6, 1], 0, { sit: true, anim: 8, rarity: 'rare' }),
  def('drop_tower', 'drop tower', 'drop_tower', 'fun', 2, 2, 14, [5, 17], 0, { sit: true, anim: 8, rarity: 'epic' }),
  def('coaster_gate', 'coaster station', 'coaster_gate', 'fun', 4, 1, 64, [20, 17], 0, { sit: true, anim: 8, rarity: 'epic' }),
  def('track_bed', 'coaster trestle', 'track_bed', 'decor', 1, 1, 6, [21, 20], 0),
  def('rattan_sofa', 'rattan sofa', 'rattan_sofa', 'seating', 2, 1, 32, [2, 19], 520, { sit: true, rarity: 'rare' }),
  def('rattan_pouf', 'rattan pouf', 'rattan_pouf', 'seating', 1, 1, 20, [19, 2], 140, { sit: true }),
  def('coffee_table', 'walnut coffee table', 'coffee_table', 'tables', 2, 1, 20, [21, 1], 260, { anim: 6, rarity: 'rare' }),
  def('bulb_tree', 'edison lamp', 'bulb_tree', 'lights', 1, 1, 96, [29, 16], 240, { use: true, anim: 6, rarity: 'rare' }),
  def('potted_fern', 'potted fern', 'potted_fern', 'outdoor', 1, 1, 50, [15, 18], 110, { anim: 8 }),
  def('flower_basket', 'flower basket', 'flower_basket', 'outdoor', 1, 1, 34, [16, 19], 90, { anim: 8 }),
  def('popcorn_cart', 'popcorn cart', 'popcorn_cart', 'fun', 2, 1, 92, [5, 17], 640, { use: true, anim: 8, rarity: 'epic' }),
  def('candy_cart', 'cotton candy cart', 'candy_cart', 'fun', 2, 1, 92, [6, 12], 620, { use: true, anim: 8, rarity: 'epic' }),
  def('ticket_booth', 'ticket booth', 'ticket_booth', 'decor', 2, 2, 124, [20, 5], 900, { anim: 8, rarity: 'epic' }),
  def('claw_machine', 'claw machine', 'claw_machine', 'fun', 1, 1, 86, [7, 17], 480, { use: true, anim: 12, rarity: 'rare' }),
  def('balloon_cart', 'balloon cart', 'balloon_cart', 'decor', 1, 1, 120, [8, 17], 280, { anim: 8, rarity: 'rare' }),
  def('dancing_fountain', 'dancing fountain', 'dancing_fountain', 'outdoor', 3, 3, 64, [24, 10], 1200, { anim: 12, rarity: 'epic' }),
  def('park_lamp', 'brass lantern', 'park_lamp', 'lights', 1, 1, 80, [29, 17], 180, { use: true, anim: 6 }),
  def('high_striker', 'high striker', 'high_striker', 'fun', 1, 1, 150, [5, 17], 520, { use: true, anim: 12, rarity: 'epic' }),
  def('snack_bar', 'snack bar', 'snack_bar', 'tables', 2, 1, 70, [20, 1], 700, { use: true, anim: 8, rarity: 'epic' }),
  def('park_bench', 'park bench', 'park_bench', 'seating', 2, 1, 30, [20, 29], 180, { sit: true }),
  def('brass_stanchion', 'brass stanchion', 'brass_stanchion', 'decor', 1, 1, 36, [17, 5], 60),
  def('woven_rug', 'jute rug', 'woven_rug', 'floor', 2, 2, 0, [22, 19], 160, { walkable: true }),
  def('queue_path', 'promenade tile', 'queue_path', 'floor', 1, 1, 0, [23, 21], 0, { walkable: true }),
  // wonder dome wall pieces hang on the back wall, walkable like the lab art
  def('marquee_sign', 'wonder marquee', 'wall_park', 'decor', 4, 1, 96, [5, 17], 0, { walkable: true, anim: 8, rarity: 'epic' }),
  def('arched_window', 'garden window', 'wall_park', 'decor', 2, 1, 96, [21, 15], 380, { walkable: true, anim: 12, rarity: 'rare' }),
  def('framed_posters', 'ride posters', 'wall_park', 'decor', 3, 1, 92, [21, 17], 420, { walkable: true, anim: 8, rarity: 'rare' }),
  def('wall_clock', 'station clock', 'wall_park', 'decor', 1, 1, 92, [29, 1], 150, { walkable: true, anim: 12 }),
  // ---- game den set
  // game tables: sit in a gaming chair either side to be matched; `on` lights up while a match is live
  def('gt_c4', 'connect four table', 'game_table', 'fun', 1, 1, 34, [11, 16], 0, { anim: 8, rarity: 'epic' }),
  def('gt_ttt', 'tic-tac-toe table', 'game_table', 'fun', 1, 1, 34, [7, 30], 0, { anim: 8, rarity: 'epic' }),
  def('gt_reversi', 'reversi table', 'game_table', 'fun', 1, 1, 34, [13, 0], 0, { anim: 8, rarity: 'epic' }),
  def('gt_dots', 'dots & boxes table', 'game_table', 'fun', 1, 1, 34, [9, 1], 0, { anim: 8, rarity: 'epic' }),
  def('game_chair', 'gaming chair', 'game_chair', 'seating', 1, 1, 40, [9, 31], 240, { sit: true, anim: 8, rarity: 'rare' }),
  def('bean_bag', 'bean bag', 'bean_bag', 'seating', 1, 1, 20, [7, 9], 130, { sit: true }),
  def('game_shelf', 'board game shelf', 'game_shelf', 'decor', 2, 1, 72, [20, 21], 320, { rarity: 'rare' }),
  def('trophy_case', 'trophy case', 'trophy_case', 'decor', 1, 1, 76, [17, 21], 420, { anim: 8, rarity: 'epic' }),
  def('giant_dice', 'giant dice', 'giant_dice', 'decor', 1, 1, 36, [27, 7], 150, { anim: 8 }),
  def('chess_king', 'chess king statue', 'chess_king', 'decor', 1, 1, 70, [29, 17], 280, { anim: 8, rarity: 'rare' }),
  def('pool_table', 'pool table', 'pool_table', 'fun', 3, 2, 26, [13, 20], 900, { anim: 12, rarity: 'epic' }),
  def('dice_rug', 'dice rug', 'dice_rug', 'floor', 2, 2, 0, [9, 31], 150, { walkable: true }),
  def('pixel_lamp', 'pixel lamp', 'pixel_lamp', 'lights', 1, 1, 60, [11, 7], 160, { use: true, anim: 8 }),
  // game den wall pieces hang on the back wall, walkable like the lab art
  def('neon_game', 'GAME ON neon', 'wall_den', 'decor', 3, 1, 96, [11, 7], 0, { walkable: true, anim: 8, rarity: 'epic' }),
  def('scoreboard', 'scoreboard', 'wall_den', 'decor', 3, 1, 96, [28, 16], 0, { walkable: true, anim: 12, rarity: 'rare' }),
  def('dartboard', 'dartboard', 'wall_den', 'decor', 1, 1, 90, [5, 1], 120, { walkable: true, anim: 8 }),
  // ---- casino (spec 2026-09-14): expensive rares, chance furni tracked per item
  def('dicemaster', 'Dicemaster', 'dicemaster', 'casino', 1, 1, 26, [1, 0], 8000, { use: true, anim: 8, rarity: 'epic', interaction: 'dice6', blurb: 'A honey-gold dice chest on a carved stand. Crack the lid and let fate pick a face.' }),
  def('holodice', 'Holodice', 'holodice', 'casino', 1, 1, 34, [9, 13], 15000, { use: true, anim: 8, rarity: 'epic', interaction: 'dice100', blurb: 'A glass cube that hums on a gold pedestal and glows as it rolls anywhere from 1 to 100.' }),
  def('wheel_fortune', 'Wheel of Fortune', 'wheel_fortune', 'casino', 2, 1, 96, [5, 24], 25000, { use: true, anim: 12, rarity: 'epic', interaction: 'wheel', ltd: 100, blurb: 'Eight lacquered segments, a ring of bulbs and one very dramatic spin.' }),
  def('dragon_egg', 'Dragon Egg', 'dragon_egg', 'casino', 1, 1, 60, [14, 24], 75000, { anim: 12, rarity: 'epic', ltd: 50, blurb: 'Green scales, gold speckles, a slow warm glow. Nobody knows when it will hatch.' }),
  def('throne_gold', 'Golden Throne', 'throne', 'casino', 1, 1, 58, [24, 5], 50000, { sit: true, anim: 8, rarity: 'epic', ltd: 100, blurb: 'Gilded, velvet-lined and entirely unnecessary. Sit like you own the casino.' }),
  def('felt_table', 'casino felt table', 'felt_table', 'casino', 2, 1, 20, [15, 19], 900, { blurb: 'Green felt, gold rail, a couple of chips left behind. The house always sets the table.' }),
  def('chip_stack', 'chip stack', 'chip_stack', 'casino', 1, 1, 18, [5, 24], 300, { blurb: 'A tidy tower of chips. Purely decorative, sadly.' }),
  def('casino_carpet', 'casino carpet', 'casino_carpet', 'casino', 1, 1, 0, [5, 24], 300, { walkable: true, blurb: 'Deep red carpet with gold diamonds, loud in the best way.' }),
  def('neon_casino', 'CASINO neon', 'neon_casino', 'casino', 3, 1, 96, [5, 24], 2000, { walkable: true, anim: 8, rarity: 'rare', blurb: 'Six glowing letters and a rail of chasing bulbs. The party starts here.' }),
  def('slot_prop', 'slot machine prop', 'slot_prop', 'casino', 1, 1, 64, [5, 24], 1500, { use: true, anim: 8, rarity: 'rare', blurb: 'A cherry-red one-armed bandit with spinning reels. Pull the lever, keep your coins.' }),
  def('velvet_rope_gold', 'gold velvet rope', 'velvet_rope_gold', 'casino', 1, 1, 34, [24, 5], 400, { blurb: 'Brass post, red rope. VIPs only, obviously.' }),
  // ---- trading room set (spec 2026-09-14)
  def('egg_stack_2', 'Egg Stack ×2', 'egg_stack_2', 'casino', 1, 1, 60, [14, 5], 150000, { anim: 12, rarity: 'epic', ltd: 30, blurb: 'A dragon egg with a ruby egg balanced on top, nested in a gold cradle. Twice the hatching, twice the bragging.' }),
  def('egg_stack_3', 'Egg Stack ×3', 'egg_stack_3', 'casino', 1, 1, 96, [14, 24], 250000, { anim: 12, rarity: 'epic', ltd: 15, blurb: 'Emerald, ruby and sapphire eggs in a gold tower, crowned. Only fifteen were ever laid.' }),
  def('egg_wall', 'Egg Wall', 'egg_wall', 'casino', 2, 1, 48, [14, 5], 40000, { rarity: 'rare', blurb: 'Rows of speckled eggs on a gold-trimmed marble base. Line them up edge to edge for a wall that never ends.' }),
  def('gold_patch', 'Gold Patch', 'gold_patch', 'casino', 1, 1, 0, [5, 24], 500, { walkable: true, blurb: 'Engraved gold floor plate. Lay a few and the whole room feels richer.' }),
  def('leaf_hedge', 'Leaf Hedge', 'leaf_hedge', 'casino', 1, 1, 40, [15, 5], 900, { blurb: 'A crisply trimmed hedge in a gold planter. Keeps the riff-raff on the carpet.' }),
  def('palm_planter', 'Palm Planter', 'palm_planter', 'casino', 1, 1, 90, [15, 24], 1200, { blurb: 'A tall palm in a polished brass pot. Instant high-roller holiday.' }),
  def('gold_rail', 'Gold Rail', 'gold_rail', 'casino', 1, 1, 36, [24, 5], 400, { blurb: 'A short gold post with a velvet top. Line them up to fence off the good stuff.' }),
  def('trade_sofa', 'Trade Sofa', 'trade_sofa', 'casino', 2, 1, 44, [5, 24], 2000, { sit: true, blurb: 'Red velvet on little gold feet. The comfiest place to haggle.' }),
  def('trading_banner', 'Trading Room Banner', 'trading_banner', 'casino', 2, 1, 96, [5, 24], 2500, { walkable: true, anim: 8, rarity: 'rare', blurb: 'A gold TRADING ROOM banner with an egg crest. Hang it on the back wall and open for business.' }),
];

/** Rides whose platform lies flat under the vehicles drawn on top of it. */
export const RIDE_PLATFORMS = new Set(['carousel', 'swing_ride', 'teacup_ride', 'drop_tower']);

export const MAX_FURNITURE_PER_ROOM = 120;
/** system rooms (the lobby) carry a lot more décor */
export const MAX_FURNITURE_SYSTEM_ROOM = 1400;

export const STARTING_COINS = 1500;
export const COINS_PER_MINUTE = 5;

const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

const CAT_BLURB: Record<FurnitureCat, string> = {
  seating: 'A cozy piece of seating.',
  tables: 'A sturdy table to gather around.',
  lights: 'A light to set the mood.',
  fun: 'Something fun to play with.',
  outdoor: 'A breath of fresh air for any room.',
  decor: 'A decorative touch for your room.',
  floor: 'Flooring to tie the room together.',
  casino: 'A touch of casino glamour.',
};

/** the item's flavour text, or a simple line for its category */
export function blurbFor(d: FurnitureDef): string {
  return d.blurb ?? CAT_BLURB[d.cat];
}

export function furnitureDef(id: string): FurnitureDef | undefined {
  return BY_ID.get(id);
}

/** Items tracked one row per item (serials, per-item state) rather than as an inventory count. */
export function isInstanceDef(d: FurnitureDef): boolean {
  return !!d.ltd || !!d.interaction;
}

export interface Placement {
  id: string;
  def: string;
  x: number;
  y: number;
  rot: 0 | 1 | 2 | 3;
  /** usable items: switched on? (persisted with the layout) */
  on?: boolean;
  /** chance furni face: '0' closed, '-1' rolling, else the result */
  state?: string;
  /** instance item row id (undefined for counted commons and system décor) */
  itemId?: string;
  /** LTD serial shown as #n */
  serial?: number;
}

export function footprint(d: FurnitureDef, rot: number): { w: number; h: number } {
  return rot % 2 === 0 ? { w: d.w, h: d.h } : { w: d.h, h: d.w };
}

export function tilesOf(p: Placement): Array<[number, number]> | null {
  const d = furnitureDef(p.def);
  if (!d) return null;
  const { w, h } = footprint(d, p.rot);
  const out: Array<[number, number]> = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([p.x + dx, p.y + dy]);
  return out;
}

/**
 * Room floor shape: one string per row, '1' = floor tile, '0' = void
 * (water, sky, nothing). `null` means the full square is floor.
 */
export type RoomMask = string[] | null;

export function maskAllows(mask: RoomMask, x: number, y: number): boolean {
  if (!mask) return true;
  return mask[y]?.[x] === '1';
}

export function parseMask(raw: unknown, size: number): RoomMask {
  if (!Array.isArray(raw) || raw.length !== size) return null;
  if (!raw.every((r) => typeof r === 'string' && r.length === size && /^[01]+$/.test(r))) return null;
  return raw as string[];
}

export type PlacementError = 'unknown_def' | 'out_of_bounds' | 'overlap' | 'bad_rot' | 'bad_coords';

/**
 * Validate a placement against room shape and other placements.
 * Rule: solid items may not overlap any solid item; rugs may not overlap rugs;
 * furniture may sit on a rug. Seats are solid for this purpose.
 */
export function validatePlacement(
  p: Placement,
  roomSize: number,
  others: Iterable<Placement>,
  mask: RoomMask = null,
): PlacementError | null {
  const d = furnitureDef(p.def);
  if (!d) return 'unknown_def';
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return 'bad_coords';
  if (![0, 1, 2, 3].includes(p.rot)) return 'bad_rot';
  const { w, h } = footprint(d, p.rot);
  if (p.x < 0 || p.y < 0 || p.x + w > roomSize || p.y + h > roomSize) return 'out_of_bounds';
  const mineTiles = tilesOf(p)!;
  if (mask && mineTiles.some(([x, y]) => !maskAllows(mask, x, y))) return 'out_of_bounds';
  const mine = new Set(mineTiles.map(([x, y]) => `${x},${y}`));
  for (const o of others) {
    if (o.id === p.id) continue;
    const od = furnitureDef(o.def);
    if (!od) continue;
    if (od.walkable !== d.walkable) continue; // rug vs furniture may overlap
    const ot = tilesOf(o);
    if (ot && ot.some(([x, y]) => mine.has(`${x},${y}`))) return 'overlap';
  }
  return null;
}

/** Walkability grid derived from room shape and placements. Seats are walkable (you walk onto them to sit). */
export function buildGrid(roomSize: number, placements: Iterable<Placement>, mask: RoomMask = null): Grid {
  const blocked: Array<[number, number]> = [];
  if (mask) {
    for (let y = 0; y < roomSize; y++) for (let x = 0; x < roomSize; x++) if (!maskAllows(mask, x, y)) blocked.push([x, y]);
  }
  for (const p of placements) {
    const d = furnitureDef(p.def);
    if (!d || d.walkable || d.sit) continue;
    const t = tilesOf(p);
    if (t) blocked.push(...t);
  }
  return makeGrid(roomSize, roomSize, blocked);
}

/** Find the topmost placement covering a tile (furniture over rug). */
export function placementAt(x: number, y: number, placements: Iterable<Placement>): Placement | null {
  let rug: Placement | null = null;
  for (const p of placements) {
    const t = tilesOf(p);
    if (!t || !t.some(([tx, ty]) => tx === x && ty === y)) continue;
    const d = furnitureDef(p.def)!;
    if (!d.walkable) return p;
    rug = p;
  }
  return rug;
}

/** Seat under a tile, if any. */
export function seatAt(x: number, y: number, placements: Iterable<Placement>): Placement | null {
  const p = placementAt(x, y, placements);
  return p && furnitureDef(p.def)?.sit ? p : null;
}

/** Facing direction for someone sitting on a seat (backrest is on the rot-0 "top" edge). */
export function seatFacing(rot: number): number {
  // rot 0: backrest along the y=0 edge -> face down (2); each rot turns clockwise
  return [2, 3, 0, 1][rot % 4];
}

/** Manhattan distance from a tile to the nearest tile of a placement. */
export function distanceTo(x: number, y: number, p: Placement): number {
  const t = tilesOf(p);
  if (!t) return Infinity;
  let best = Infinity;
  for (const [tx, ty] of t) best = Math.min(best, Math.abs(tx - x) + Math.abs(ty - y));
  return best;
}

export const PLACEMENT_ID = /^[A-Za-z0-9_-]{4,24}$/;
