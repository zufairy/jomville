import { WARDROBE } from './wardrobe.generated';
import { GEAR, GEAR_SLOTS } from './gear';

/**
 * Avatar looks are assembled from real sprite sheets (see
 * client/public/lpc/manifest.json, built by scripts/fetch-lpc.mjs), plus drawn
 * gear on top (gear.ts). Every field below names a part id, a gear id or a
 * colour variant, so the server can validate a look without knowing how it is drawn.
 */

/** Global 32-colour palette, still used by rooms, furniture and UI chrome. */
export const PALETTE = [
  0x3b2a2a, 0xfff7e6, 0xf6ecd9, 0xffd6a5, 0xff8a5b, 0xe0553d, 0xffb3c6, 0xff6f91,
  0xd6a3ff, 0x9b6bdc, 0x7ecbff, 0x3f8fe0, 0x8fe3d2, 0x2fb39b, 0xb8e986, 0x63b04a,
  0xf9d66b, 0xf2b632, 0xf0a35e, 0xc9793a, 0x9c6242, 0x6b4632, 0xd9c4b0, 0xb59e88,
  0xe6e2ea, 0xb7b3c4, 0x7d7a91, 0xffffff, 0x2c3e50, 0x1c1c1c, 0xfff1a8, 0xa8e6ff,
] as const;

export const BODY_TYPES = ['male', 'female'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

/** Cosmetic slots a player can change and that drops can target. The last four are drawn gear. */
export const SLOTS = ['hair', 'hat', 'torso', 'legs', 'feet', 'face', 'helm', 'aura', 'back'] as const;
export type Slot = (typeof SLOTS)[number];

/** Slots that may be left empty. */
export const OPTIONAL_SLOTS: readonly Slot[] = ['hair', 'hat', ...GEAR_SLOTS];

export function isOptionalSlot(slot: Slot): boolean {
  return OPTIONAL_SLOTS.includes(slot);
}

export type ItemRarity = 'starter' | 'common' | 'rare' | 'epic' | 'legendary';

export interface ItemDef {
  id: string;
  slot: Slot;
  name: string;
  /** starter = everyone owns it; anything else must be pulled from a capsule machine */
  rarity: ItemRarity;
  /** colour variants shipped for this garment */
  variants: string[];
}

const SPRITE_SLOTS: readonly string[] = ['hair', 'hat', 'torso', 'legs', 'feet'];

export const ITEMS: ItemDef[] = [
  ...WARDROBE.filter((p) => !p.base && SPRITE_SLOTS.includes(p.slot)).map((p) => ({
    id: p.id,
    slot: p.slot as Slot,
    name: p.name,
    rarity: p.rarity as ItemRarity,
    variants: p.variants,
  })),
  // drawn gear has no colour variants; one 'default' keeps the colour plumbing uniform
  ...GEAR.map((g) => ({ id: g.id, slot: g.slot, name: g.name, rarity: g.rarity, variants: ['default'] })),
];

export const ITEMS_BY_SLOT = Object.fromEntries(SLOTS.map((s) => [s, ITEMS.filter((i) => i.slot === s)])) as Record<Slot, ItemDef[]>;

export function itemDef(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function isStarter(id: string): boolean {
  return id === 'none' || itemDef(id)?.rarity === 'starter';
}

const basePart = (slot: string) => WARDROBE.find((p) => p.base && p.slot === slot);

/** Skin tones, eye colours: shared by body and head so they always match. */
export const SKIN_TONES: string[] = basePart('body')?.variants ?? ['light'];
export const EYE_COLOURS: string[] = basePart('eyes')?.variants ?? ['blue'];

/** Colour choices offered per slot, unioned across that slot's garments. */
export function slotColours(slot: Slot): string[] {
  const set = new Set<string>();
  for (const i of ITEMS_BY_SLOT[slot]) for (const v of i.variants) set.add(v);
  return [...set].sort();
}

export interface AvatarConfig {
  body: BodyType;
  skin: string;
  eyes: string;
  hair: string; // item id, or 'none'
  hairColour: string;
  hat: string; // item id, or 'none'
  hatColour: string;
  torso: string;
  torsoColour: string;
  legs: string;
  legsColour: string;
  feet: string;
  feetColour: string;
  /** drawn gear: gear id, or 'none' */
  face: string;
  helm: string;
  aura: string;
  back: string;
}

const firstOf = (slot: Slot, prefer?: string): string => {
  const list = ITEMS_BY_SLOT[slot].filter((i) => i.rarity === 'starter');
  return (prefer && list.find((i) => i.id === prefer)?.id) ?? list[0]?.id ?? 'none';
};

export const DEFAULT_AVATAR: AvatarConfig = {
  body: 'male',
  skin: SKIN_TONES[0] ?? 'light',
  eyes: EYE_COLOURS[0] ?? 'blue',
  hair: firstOf('hair'),
  hairColour: 'black',
  hat: 'none',
  hatColour: 'black',
  torso: firstOf('torso', 'torso.shortsleeve'),
  torsoColour: 'white',
  legs: firstOf('legs', 'legs.pants'),
  legsColour: 'navy',
  feet: firstOf('feet', 'feet.shoes'),
  feetColour: 'black',
  face: 'none',
  helm: 'none',
  aura: 'none',
  back: 'none',
};

function pick<T extends string>(arr: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (arr as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Coerce a slot's item id, allowing 'none' only where the slot permits it. */
function pickItem(slot: Slot, v: unknown, fallback: string): string {
  if (isOptionalSlot(slot) && v === 'none') return 'none';
  return typeof v === 'string' && ITEMS_BY_SLOT[slot].some((i) => i.id === v) ? v : fallback;
}

/** Coerce a colour to one the chosen garment actually ships. */
function pickColour(itemId: string, v: unknown, fallback: string): string {
  const def = itemDef(itemId);
  if (!def) return fallback;
  if (typeof v === 'string' && def.variants.includes(v)) return v;
  return def.variants.includes(fallback) ? fallback : (def.variants[0] ?? fallback);
}

/** Coerce arbitrary input (client-supplied) into a valid look. Never throws. */
export function normalizeAvatar(input: unknown): AvatarConfig {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_AVATAR;
  const hair = pickItem('hair', o.hair, d.hair);
  const hat = pickItem('hat', o.hat, d.hat);
  const torso = pickItem('torso', o.torso, d.torso);
  const legs = pickItem('legs', o.legs, d.legs);
  const feet = pickItem('feet', o.feet, d.feet);
  return {
    body: pick(BODY_TYPES, o.body, d.body),
    skin: pick(SKIN_TONES, o.skin, d.skin),
    eyes: pick(EYE_COLOURS, o.eyes, d.eyes),
    hair,
    hairColour: hair === 'none' ? d.hairColour : pickColour(hair, o.hairColour, d.hairColour),
    hat,
    hatColour: hat === 'none' ? d.hatColour : pickColour(hat, o.hatColour, d.hatColour),
    torso,
    torsoColour: pickColour(torso, o.torsoColour, d.torsoColour),
    legs,
    legsColour: pickColour(legs, o.legsColour, d.legsColour),
    feet,
    feetColour: pickColour(feet, o.feetColour, d.feetColour),
    face: pickItem('face', o.face, d.face),
    helm: pickItem('helm', o.helm, d.helm),
    aura: pickItem('aura', o.aura, d.aura),
    back: pickItem('back', o.back, d.back),
  };
}

export function serializeAvatar(c: AvatarConfig): string {
  return JSON.stringify(normalizeAvatar(c));
}

export function parseAvatar(s: string | null | undefined): AvatarConfig {
  if (!s) return DEFAULT_AVATAR;
  try {
    return normalizeAvatar(JSON.parse(s));
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  const r = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const starters = (slot: Slot) => {
    const list = ITEMS_BY_SLOT[slot].filter((i) => i.rarity === 'starter');
    return list.length ? r(list) : ITEMS_BY_SLOT[slot][0];
  };
  const hair = rand() < 0.08 ? null : starters('hair');
  const hat = rand() < 0.75 ? null : starters('hat');
  const torso = starters('torso');
  const legs = starters('legs');
  const feet = starters('feet');
  // gear is never random: it is only ever pulled
  return normalizeAvatar({
    body: r(BODY_TYPES),
    skin: r(SKIN_TONES),
    eyes: r(EYE_COLOURS),
    hair: hair ? hair.id : 'none',
    hairColour: hair ? r(hair.variants) : undefined,
    hat: hat ? hat.id : 'none',
    hatColour: hat ? r(hat.variants) : undefined,
    torso: torso?.id,
    torsoColour: torso ? r(torso.variants) : undefined,
    legs: legs?.id,
    legsColour: legs ? r(legs.variants) : undefined,
    feet: feet?.id,
    feetColour: feet ? r(feet.variants) : undefined,
  });
}
