/**
 * Gear: drawn, animated cosmetics worn on top of the sprite-sheet avatar:
 * eyewear, helmets, auras and back pieces. None are starters; every piece
 * comes out of a capsule machine. The art lives client-side in
 * client/src/game/gearArt.ts, keyed by id.
 */
export const GEAR_SLOTS = ['face', 'helm', 'aura', 'back'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export type GearRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface GearDef {
  id: string;
  slot: GearSlot;
  name: string;
  rarity: GearRarity;
}

export function isGearSlot(slot: string): slot is GearSlot {
  return (GEAR_SLOTS as readonly string[]).includes(slot);
}

/** How long a "use" (tapping yourself) plays, and how often one may be sent. */
export const GEAR_USE_MS = 1400;
export const GEAR_USE_RATE = { count: 4, windowMs: 8000 };

const gear = (id: string, name: string, rarity: GearRarity): GearDef => ({ id, slot: id.split('.')[0] as GearSlot, name, rarity });

export const GEAR: GearDef[] = [
  // eyewear
  gear('face.round_specs', 'Round Specs', 'common'),
  gear('face.shades', 'Cool Shades', 'common'),
  gear('face.heart_shades', 'Heart Shades', 'common'),
  gear('face.three_d', '3D Glasses', 'common'),
  gear('face.star_shades', 'Star Shades', 'rare'),
  gear('face.pixel_shades', 'Pixel Shades', 'rare'),
  gear('face.monocle', 'Gold Monocle', 'rare'),
  gear('face.aviator', 'Gold Aviators', 'rare'),
  gear('face.ski_goggles', 'Sunset Goggles', 'rare'),
  gear('face.masquerade', 'Masquerade Mask', 'rare'),
  gear('face.vr_visor', 'VR Visor', 'epic'),
  gear('face.ruby_visor', 'Ruby Beam Visor', 'epic'),
  gear('face.cyber_mask', 'Cyber Mask', 'epic'),
  gear('face.laser_eyes', 'Laser Eyes', 'legendary'),
  gear('face.mustache', 'Dapper Mustache', 'common'),
  gear('face.clown_nose', 'Clown Nose', 'common'),
  gear('face.ninja_mask', 'Ninja Mask', 'rare'),
  gear('face.hologram', 'Hologram Visor', 'epic'),
  gear('face.dragon_eyes', 'Dragon Eyes', 'epic'),
  gear('face.diamond_shades', 'Diamond Shades', 'legendary'),
  // helmets and headgear
  gear('helm.cat_ears', 'Cat Ears', 'common'),
  gear('helm.bunny_ears', 'Bunny Ears', 'common'),
  gear('helm.devil_horns', 'Devil Horns', 'rare'),
  gear('helm.halo', 'Golden Halo', 'rare'),
  gear('helm.viking', 'Viking Helm', 'rare'),
  gear('helm.wizard', 'Wizard Hat', 'rare'),
  gear('helm.pumpkin', 'Pumpkin Head', 'rare'),
  gear('helm.knight', 'Knight Helm', 'epic'),
  gear('helm.astronaut', 'Astronaut Helmet', 'epic'),
  gear('helm.samurai', 'Samurai Kabuto', 'epic'),
  gear('helm.robot', 'Robot Head', 'epic'),
  gear('helm.crown', 'Royal Crown', 'epic'),
  gear('helm.crimson_armor', 'Crimson Armor Helm', 'legendary'),
  gear('helm.party_hat', 'Party Hat', 'common'),
  gear('helm.chef_hat', 'Chef Hat', 'common'),
  gear('helm.headphones', 'Beat Headphones', 'rare'),
  gear('helm.cyber_helmet', 'Neon Cyber Helmet', 'epic'),
  gear('helm.unicorn_horn', 'Unicorn Horn', 'epic'),
  gear('helm.flame_crown', 'Flame Crown', 'legendary'),
  // auras
  gear('aura.sparkles', 'Sparkle Aura', 'common'),
  gear('aura.bubbles', 'Bubble Aura', 'common'),
  gear('aura.leaves', 'Falling Leaves', 'common'),
  gear('aura.hearts', 'Heart Orbit', 'rare'),
  gear('aura.notes', 'Music Notes', 'rare'),
  gear('aura.snow', 'Snowfall', 'rare'),
  gear('aura.coins', 'Coin Orbit', 'epic'),
  gear('aura.lightning', 'Storm Aura', 'epic'),
  gear('aura.flame', 'Flame Aura', 'epic'),
  gear('aura.rainbow', 'Rainbow Ring', 'epic'),
  gear('aura.galaxy', 'Galaxy Aura', 'legendary'),
  gear('aura.void', 'Void Aura', 'legendary'),
  gear('aura.confetti', 'Confetti Pop', 'common'),
  gear('aura.petals', 'Sakura Petals', 'common'),
  gear('aura.fireflies', 'Fireflies', 'rare'),
  gear('aura.plasma', 'Plasma Orbs', 'epic'),
  gear('aura.sunburst', 'Golden Sunburst', 'epic'),
  gear('aura.cosmic_rings', 'Cosmic Rings', 'legendary'),
  // back pieces
  gear('back.cape_red', 'Hero Cape', 'common'),
  gear('back.backpack', 'Adventure Pack', 'common'),
  gear('back.balloon', 'Red Balloon', 'common'),
  gear('back.guitar', 'Guitar', 'common'),
  gear('back.cape_royal', 'Royal Cape', 'rare'),
  gear('back.bat_wings', 'Bat Wings', 'rare'),
  gear('back.butterfly', 'Butterfly Wings', 'rare'),
  gear('back.angel_wings', 'Angel Wings', 'epic'),
  gear('back.fairy', 'Fairy Wings', 'epic'),
  gear('back.jetpack', 'Jetpack', 'epic'),
  gear('back.dragon_wings', 'Dragon Wings', 'legendary'),
  gear('back.phoenix', 'Phoenix Wings', 'legendary'),
  gear('back.kite', 'Rainbow Kite', 'common'),
  gear('back.katana', 'Katana', 'rare'),
  gear('back.shield', 'Hero Shield', 'rare'),
  gear('back.robot_arms', 'Robot Arms', 'epic'),
  gear('back.rocket', 'Rocket Pack', 'epic'),
  gear('back.ice_wings', 'Crystal Ice Wings', 'legendary'),
];
