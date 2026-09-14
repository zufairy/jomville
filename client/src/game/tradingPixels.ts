import { PixelCanvas, PixelMap } from './pixelArt';
import { GOLD, Iso, V3, cached, drum, hash, layer, mixHex, orb, shimmer } from './pixelKit';

/**
 * Pixel-art frames for the Trading Room set, in the Dicemaster style: dark ink
 * outline, 3-4 tone ramps, crisp pixels. Scaled eggs (dragon egg, egg stacks,
 * egg wall), gold floor plates, hedges, palms, rails, the trade sofa and the
 * TRADING ROOM wall banner. Frames are built on first use and cached.
 */

// ---------------------------------------------------------------- eggs

/** shine, light, mid, dark, deep */
type Ramp = [string, string, string, string, string];

const EMERALD: Ramp = ['1', '2', '3', '4', '5'];
const RUBY: Ramp = ['6', '7', '8', '9', '0'];
const SAPPHIRE: Ramp = ['A', 'B', 'C', 'D', 'E'];

const EGG_COLOURS: Record<string, number> = {
  '1': 0xd4ffd8, '2': 0x8ff09a, '3': 0x45c46a, '4': 0x2a8a4f, '5': 0x175c34,
  '6': 0xffd6dc, '7': 0xff7a8c, '8': 0xd8243e, '9': 0x9a1030, '0': 0x5e0a1e,
  A: 0xdcefff, B: 0x8cc8ff, C: 0x3a7ee0, D: 0x24509e, E: 0x14305e,
};
const EGG_GLOW: Record<string, number> = { G: 0x7cf29a, P: 0xff8a9a, Q: 0x8cc8ff };
const SPECK = 'Y';

/** slow breathing glow, 12 frames */
const PULSE = [0, 0, 1, 1, 2, 3, 3, 2, 1, 1, 0, 0];

/** egg palette brightened toward its glow as the pulse peaks */
function eggPalette(pulse: number): Record<string, number> {
  const out: Record<string, number> = { ...GOLD, [SPECK]: 0xffd84a, R: 0xe0203c, S: 0xff8a9a, ...EGG_GLOW };
  const glowOf = (k: string) => ('12345'.includes(k) ? EGG_GLOW.G : '67890'.includes(k) ? EGG_GLOW.P : EGG_GLOW.Q);
  for (const [k, c] of Object.entries(EGG_COLOURS)) out[k] = mixHex(c, glowOf(k), pulse * 0.07);
  return out;
}

/**
 * A scaled egg lit from the upper left: narrower at the top, offset scallop
 * scales in the mid tones, a few gold speckles and a shine.
 */
function egg(cv: PixelCanvas, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, seed: number, pulse = 0) {
  const y0 = Math.floor(cy - ry);
  for (let y = y0; y <= Math.ceil(cy + ry); y++) {
    const v = (y + 0.5 - cy) / ry;
    if (v <= -1 || v >= 1) continue;
    const half = rx * Math.sqrt(1 - v * v) * (v < 0 ? 1 + 0.2 * v : 1);
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > half) continue;
      const u = dx / rx;
      const lit = -0.6 * u - 0.55 * v + 0.35 * Math.sqrt(Math.max(0, 1 - u * u - v * v));
      let i = Math.max(1, Math.min(4, Math.floor((0.85 - lit) * 3)));
      const sy = y - y0 + seed;
      const ly = sy % 3;
      const lx = (((x + (Math.floor(sy / 3) % 2) * 2 + seed) % 4) + 4) % 4;
      const scale = (ly === 2 && (lx === 1 || lx === 2)) || (ly === 0 && (lx === 0 || lx === 3));
      if (scale && i >= 2 && i < 4) i++;
      cv.set(x, y, ramp[i]);
    }
  }
  // speckles on the lit side, a two-pixel shine up top
  for (let k = 0; k < 5; k++) {
    const sx = Math.round(cx + (hash(seed, k, 1) - 0.6) * rx * 1.3);
    const sy = Math.round(cy + (hash(seed, k, 2) - 0.5) * ry * 1.4);
    cv.paint(sx, sy, SPECK);
  }
  const hx = Math.round(cx - rx * 0.45);
  const hy = Math.round(cy - ry * 0.45);
  cv.paint(hx, hy, ramp[0]);
  cv.paint(hx, hy + 1, pulse >= 2 ? ramp[0] : ramp[1]);
  if (pulse >= 3) cv.paint(hx + 1, hy, ramp[0]);
}

/** sparse glow speckle around an egg, denser at the peak of the pulse */
function eggHalo(cv: PixelCanvas, cx: number, cy: number, rx: number, ry: number, key: string, pulse: number, frame: number) {
  if (!pulse) return;
  cv.ellipse(cx, cy, rx + 1.5 + pulse * 0.6, ry + 1.5 + pulse * 0.6, (x, y) => (hash(x, y, frame) < 0.06 + pulse * 0.07 ? key : null));
}

/** gold goblet: round foot, short stem, open bowl (front rim drawn by goldRim) */
function goldCup(l: PixelCanvas, cx: number, gy: number, bowlY: number, bowlRx: number) {
  drum(l, cx, gy - 4, 7, 2.5, 2, 'a', ['b', 'b', 'c', 'd', 'e']);
  l.rect(cx - 2, bowlY + 2, 4, gy - 4 - bowlY - 2, 'c').rect(cx - 2, bowlY + 2, 1, gy - 4 - bowlY - 2, 'a').rect(cx + 1, bowlY + 2, 1, gy - 4 - bowlY - 2, 'd');
  l.ellipse(cx, bowlY, bowlRx, 5, (x, y) => (y < bowlY - 1 ? null : x < cx - 4 ? 'a' : x < cx + 2 ? 'b' : x < cx + 6 ? 'c' : 'd'));
}

function goldRim(l: PixelCanvas, cx: number, y: number, rx: number, ry: number) {
  l.ellipse(cx, y, rx, ry, (x, yy) => (yy < y ? null : x < cx - rx * 0.5 ? 'w' : x < cx ? 'a' : x < cx + rx * 0.6 ? 'b' : 'c'));
}

function dragonEggFrame(frame: number): PixelMap {
  const cv = new PixelCanvas(30, 46);
  const gy = 40;
  const cx = 15;
  const pulse = PULSE[frame % 12];
  eggHalo(cv, cx, 19, 8, 11, 'G', pulse, frame);
  layer(cv, (l) => goldCup(l, cx, gy, gy - 13, 9));
  layer(cv, (l) => egg(l, cx, 19, 8, 11, EMERALD, 3, pulse));
  layer(cv, (l) => goldRim(l, cx, gy - 13, 9, 3));
  if (pulse === 3) for (const [x, y] of [[4, 8], [26, 13], [5, 29]]) cv.set(x, y, '1');
  return cv.toMap(eggPalette(pulse), cv.h - gy);
}

/** a little gold collar that one egg nests in on top of another */
function collar(l: PixelCanvas, cx: number, y: number, rx: number) {
  l.ellipse(cx, y, rx, 2, (x, yy) => (yy < y - 0.5 ? (x < cx ? 'b' : 'c') : x < cx - rx * 0.4 ? 'a' : x < cx + rx * 0.4 ? 'b' : 'd'));
  l.set(Math.round(cx - rx * 0.5), Math.round(y + 1), 'w');
}

function eggStack2Frame(frame: number): PixelMap {
  const cv = new PixelCanvas(30, 40);
  const gy = 34;
  const cx = 15;
  const pulse = PULSE[frame % 12];
  eggHalo(cv, cx, gy - 20, 7, 12, 'P', pulse, frame);
  layer(cv, (l) => {
    drum(l, cx, gy - 4, 7, 2.5, 2, 'a', ['b', 'b', 'c', 'd', 'e']);
    l.rect(cx - 2, gy - 7, 4, 3, 'c').rect(cx - 2, gy - 7, 1, 3, 'a').rect(cx + 1, gy - 7, 1, 3, 'd');
    l.ellipse(cx, gy - 10, 8, 4, (x, y) => (y < gy - 11 ? null : x < cx - 3 ? 'a' : x < cx + 3 ? 'b' : 'd'));
  });
  layer(cv, (l) => egg(l, cx, gy - 15, 6.5, 7, EMERALD, 1, pulse));
  layer(cv, (l) => {
    goldRim(l, cx, gy - 10, 8, 2.5);
    // cradle prongs hugging the bottom egg
    for (const s of [-1, 1]) {
      l.line(cx + s * 7, gy - 11, cx + s * 7, gy - 15, s < 0 ? 'a' : 'c');
      l.set(cx + s * 7, gy - 16, 'w');
    }
  });
  layer(cv, (l) => collar(l, cx, gy - 21, 4.5));
  layer(cv, (l) => egg(l, cx, gy - 26, 5, 5.5, RUBY, 5, pulse));
  return cv.toMap(eggPalette(pulse), cv.h - gy);
}

function eggStack3Frame(frame: number): PixelMap {
  const cv = new PixelCanvas(32, 60);
  const gy = 54;
  const cx = 16;
  const pulse = PULSE[frame % 12];
  eggHalo(cv, cx, gy - 27, 8, 20, 'Q', pulse, frame);
  layer(cv, (l) => {
    drum(l, cx, gy - 5, 8, 3, 2, 'a', ['b', 'b', 'c', 'd', 'e']);
    l.rect(cx - 2, gy - 8, 4, 4, 'c').rect(cx - 2, gy - 8, 1, 4, 'a').rect(cx + 1, gy - 8, 1, 4, 'd');
    l.ellipse(cx, gy - 11, 8.5, 4, (x, y) => (y < gy - 12 ? null : x < cx - 3 ? 'a' : x < cx + 3 ? 'b' : 'd'));
  });
  layer(cv, (l) => egg(l, cx, gy - 17, 7, 7.5, EMERALD, 2, pulse));
  layer(cv, (l) => {
    goldRim(l, cx, gy - 11, 8.5, 2.5);
    for (const s of [-1, 1]) {
      l.line(cx + s * 7, gy - 12, cx + s * 7, gy - 17, s < 0 ? 'a' : 'c');
      l.set(cx + s * 7, gy - 18, 'w');
    }
  });
  layer(cv, (l) => collar(l, cx, gy - 24, 5));
  layer(cv, (l) => egg(l, cx, gy - 29, 6, 6.5, RUBY, 4, pulse));
  layer(cv, (l) => collar(l, cx, gy - 34.5, 4.5));
  layer(cv, (l) => egg(l, cx, gy - 38, 5, 5, SAPPHIRE, 6, pulse));
  // crown cap: a gold band with three points and a ruby
  layer(cv, (l) => {
    const top = gy - 48;
    l.text(['b...b...b', 'ba..a..ab', 'aabaaabaa', 'abbbbbbbc', 'bccccccdd'], cx - 4, top);
    l.set(cx, top + 3, 'R');
    l.set(cx - 3, top + 3, 'S');
    l.set(cx + 3, top + 3, 'S');
  });
  shimmer(cv, frame % 8, 'ab', 40);
  return cv.toMap(eggPalette(pulse), cv.h - gy);
}

// ---------------------------------------------------------------- egg wall

const MARBLE = { m: 0xf4efe6, n: 0xdcd3c6, v: 0xb3a797, k: 0xa3968a, j: 0x7d7166 };

/**
 * Two tiles of marble plinth with a gold trim, topped by two tiers of eggs.
 * The base runs flush to both ends of the footprint and drops its outline at
 * the far (left) end, so walls placed edge to edge read as one long wall; egg
 * spacing repeats every tile. Odd rotations mirror it along the other axis.
 */
function eggWallFrame(): PixelMap {
  const OX = 14;
  const OY = 20;
  const cv = new PixelCanvas(44, 44);
  const base = new PixelCanvas(cv.w, cv.h);
  const bi = new Iso(base, OX, OY);
  const vein = (x: number, z: number) => {
    const t = (((x % 32) + 32) % 32) * 0.55 + z * 1.2 + hash(Math.floor((((x % 32) + 32) % 32) / 8), 0, 3) * 5;
    return t % 7 < 0.6;
  };
  bi.box(
    0, 4, 0, 32, 12, 10,
    (p) => (p[1] > 11 ? 'a' : 'b'),
    (p) => (p[2] > 9.2 ? 'w' : p[2] > 8 ? 'a' : p[2] < 1.5 ? 'c' : p[2] < 2.3 ? 'd' : vein(p[0], p[2]) ? 'v' : p[2] > 6.5 ? 'm' : 'n'),
    (p) => (p[2] > 8 ? 'c' : p[2] < 1.5 ? 'e' : vein(p[1] * 2, p[2]) ? 'j' : 'k'),
  );
  base.outline('o');
  // no ink at the joining end: the neighbouring wall carries straight on
  const limit = OX - 3;
  for (let y = 0; y < base.h; y++)
    for (let x = 0; x <= limit; x++) {
      const k = base.get(x, y);
      if (k === '.') continue;
      if (k === 'o') base.set(x, y, '.');
      break;
    }
  cv.stamp(base);
  const iso = new Iso(cv, OX, OY);
  const tiers: Array<{ xs: number[]; z: number; rx: number; ry: number; ramps: Ramp[] }> = [
    { xs: [6, 14, 22, 30], z: 20, rx: 3.5, ry: 4.5, ramps: [SAPPHIRE, EMERALD] },
    { xs: [2, 10, 18, 26], z: 14.5, rx: 3.5, ry: 4.5, ramps: [EMERALD, RUBY] },
  ];
  for (const t of tiers)
    t.xs.forEach((x, i) => {
      const [sx, sy] = iso.p(x, 8, t.z);
      layer(cv, (l) => egg(l, sx, sy, t.rx, t.ry, t.ramps[i % 2], i + Math.round(t.z)));
    });
  return cv.toMap({ ...GOLD, ...MARBLE, ...EGG_COLOURS, [SPECK]: 0xffd84a }, cv.h - (OY + 12));
}

// ---------------------------------------------------------------- gold patch

/** a 32x16 engraved gold floor plate that tiles like the carpet */
export function goldPatchMap(): PixelMap {
  return cached('gold_patch', () => {
    const cv = new PixelCanvas(32, 16);
    for (let y = 0; y < 16; y++) {
      const half = y < 8 ? 2 * y + 1 : 2 * (15 - y) + 1;
      for (let x = 16 - half; x < 16 + half; x++) {
        const d = Math.abs(x + 0.5 - 16) / 2 + Math.abs(y + 0.5 - 8);
        const upper = y < 8;
        let k = 'b';
        if (d > 7.2) k = 'e';
        else if (d > 6.4) k = upper ? 'a' : 'c';
        else if (Math.abs(d - 4.4) < 0.5) k = 'd';
        else if (Math.abs(d - 3.6) < 0.4) k = upper ? 'a' : 'b';
        else if (d < 1.0) k = 'w';
        else if (d < 1.9) k = 'a';
        else if (d < 2.6) k = 'c';
        else if (d > 5 && (Math.floor(x / 2) + y) % 3 === 0) k = 'c';
        cv.set(x, y, k);
      }
    }
    return cv.toMap({ ...GOLD }, 8);
  });
}

// ---------------------------------------------------------------- leaf hedge

const LEAF = { G: 0xb4ef6e, H: 0x74c94c, I: 0x459a38, J: 0x2a6b2c, K: 0x18431d };

function hedgeFrame(): PixelMap {
  const OX = 16;
  const OY = 20;
  const cv = new PixelCanvas(32, 36);
  layer(cv, (l) =>
    new Iso(l, OX, OY).box(
      3, 3, 0, 13, 13, 7,
      (p) => (p[0] < 4 || p[1] < 4 ? 'w' : 'a'),
      (p) => (p[2] > 6 ? 'a' : p[2] < 1.5 ? 'd' : p[0] < 4.5 ? 'a' : 'b'),
      (p) => (p[2] > 6 ? 'b' : p[2] < 1.5 ? 'e' : 'c'),
    ),
  );
  const leaf = (base: number) => (p: V3) => {
    const n = hash(Math.floor(p[0] / 1.5), Math.floor(p[1] / 1.5), Math.floor(p[2] / 1.5));
    const i = base + (n < 0.18 ? -1 : n > 0.8 ? 1 : 0);
    return 'GHIJK'[Math.max(0, Math.min(4, i))];
  };
  layer(cv, (l) => {
    const li = new Iso(l, OX, OY);
    li.box(3.6, 3.6, 7, 12.4, 12.4, 20, leaf(1), (p) => leaf(p[2] > 17 ? 1 : 2)(p), (p) => leaf(p[2] > 17 ? 2 : 3)(p));
    // a few sprigs poking out of the clipped top
    for (const [x, y] of [[5, 6], [9, 4], [11, 9], [7, 11]] as Array<[number, number]>) li.dot(x, y, 21, hash(x, y) < 0.5 ? 'H' : 'G');
  });
  return cv.toMap({ ...GOLD, ...LEAF }, cv.h - (OY + 8));
}

// ---------------------------------------------------------------- palm planter

const PALM = { L: 0xa6e46a, M: 0x62b845, N: 0x3a8034, P: 0x225527, t: 0xcf9a5c, u: 0x9a6a3a, v: 0x654026, s: 0x3a2416 };

function palmFrame(): PixelMap {
  const cv = new PixelCanvas(44, 58);
  const gy = 52;
  const cx = 22;
  // trunk curving up and to the right
  const crownX = cx + 3;
  const crownY = gy - 37;
  layer(cv, (l) => {
    for (let y = gy - 13; y >= crownY; y--) {
      const t = (gy - 13 - y) / (gy - 13 - crownY);
      const x = Math.round(cx - 1 + 3 * t * t);
      const ring = (gy - y) % 3 === 0;
      l.set(x - 1, y, ring ? 'u' : 't');
      l.set(x, y, ring ? 'v' : 'u');
      l.set(x + 1, y, 'v');
    }
  });
  // fronds: a spine and leaflets, drooping at the tips
  const fronds: Array<[number, number, string]> = [
    [-172, 14, 'N'],
    [-12, 15, 'N'],
    [-145, 15, 'M'],
    [-38, 15, 'M'],
    [-112, 12, 'L'],
    [-70, 12, 'L'],
    [160, 11, 'N'],
    [18, 11, 'N'],
  ];
  layer(cv, (l) => {
    for (const [deg, len, key] of fronds) {
      const a = (deg * Math.PI) / 180;
      for (let s = 1; s <= len; s++) {
        const q = s / len;
        const x = crownX + Math.cos(a) * s;
        const y = crownY + Math.sin(a) * s * 0.75 + q * q * len * 0.55;
        l.set(x, y, key);
        l.set(x, y + 1, key === 'L' ? 'M' : key === 'M' ? 'N' : 'P');
        if (s % 2 === 0 && s > 2) {
          l.set(x, y + 2, key === 'L' ? 'M' : 'N');
          if (q > 0.4) l.set(x + (Math.cos(a) > 0 ? -1 : 1), y + 3, 'P');
        }
      }
    }
    orb(l, crownX, crownY + 1, 2.5, 2, ['t', 'u', 'v'], false);
  });
  // brass pot with a soil top
  layer(cv, (l) => {
    l.poly(
      [
        [cx - 7, gy - 13],
        [cx + 7, gy - 13],
        [cx + 5, gy],
        [cx - 5, gy],
      ],
      (x, y) => {
        if (y === gy - 7 || y === gy - 6) return x < cx - 2 ? 'w' : x < cx + 3 ? 'a' : 'c';
        const u = (x + 0.5 - cx) / 7;
        return u < -0.55 ? 'a' : u < -0.1 ? 'b' : u < 0.45 ? 'c' : u < 0.8 ? 'd' : 'e';
      },
    );
    l.ellipse(cx, gy - 13, 7.5, 2.4, (x, y) => (y < gy - 13 ? 'a' : x < cx ? 'b' : 'c'));
    l.ellipse(cx, gy - 13, 5.5, 1.4, 's');
    l.set(cx - 1, gy - 14, 'v');
  });
  return cv.toMap({ ...GOLD, ...PALM }, cv.h - gy);
}

// ---------------------------------------------------------------- gold rail

const VELVET = { R: 0xd21a36, S: 0xf0556c, M: 0x9a1030, K: 0x5e0a1e };

function railFrame(): PixelMap {
  const cv = new PixelCanvas(32, 34);
  const gy = 28;
  const cx = 16;
  layer(cv, (l) => {
    drum(l, cx, gy - 4, 5, 2.5, 2, 'a', ['b', 'c', 'd', 'e']);
    l.rect(cx - 1, gy - 15, 3, 12, 'c').rect(cx - 1, gy - 15, 1, 12, 'a').rect(cx + 1, gy - 15, 1, 12, 'd');
    drum(l, cx, gy - 17, 3.5, 1.5, 1, 'a', ['a', 'b', 'c', 'd']);
  });
  layer(cv, (l) => {
    orb(l, cx, gy - 21, 4, 3.5, ['S', 'R', 'R', 'M', 'K'], false);
    l.set(cx - 2, gy - 23, 'S');
    l.rect(cx, gy - 25, 1, 1, 'w');
    l.set(cx, gy - 24, 'b');
  });
  return cv.toMap({ ...GOLD, ...VELVET }, cv.h - gy);
}

// ---------------------------------------------------------------- trade sofa

function sofaFrame(): PixelMap {
  const OX = 14;
  const OY = 20;
  const cv = new PixelCanvas(44, 44);
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: (p: V3) => string, front: (p: V3) => string, side: (p: V3) => string) =>
    layer(cv, (l) => new Iso(l, OX, OY).box(x0, y0, z0, x1, y1, z1, top, front, side));
  const gold = (k: string) => () => k;
  // gold feet
  box(28.5, 3, 0, 30.5, 5, 3.5, gold('a'), gold('b'), gold('d'));
  box(1.5, 12, 0, 3.5, 14, 3.5, gold('a'), (p) => (p[0] < 2.3 ? 'w' : 'b'), gold('d'));
  box(28.5, 12, 0, 30.5, 14, 3.5, gold('a'), gold('b'), gold('d'));
  // body with gold piping along the bottom
  box(1, 3, 3, 31, 14, 9, gold('R'), (p) => (p[2] < 4.2 ? (p[0] < 3 ? 'a' : 'b') : p[2] > 7.8 ? 'S' : 'R'), (p) => (p[2] < 4.2 ? 'c' : 'M'));
  // tufted backrest with a rolled gold top
  box(
    1, 1, 9, 31, 4.5, 21,
    (p) => (p[1] > 3.6 ? 'w' : 'a'),
    (p) => {
      if (p[2] > 19.8) return 'a';
      const tx = (((p[0] - 4) % 6) + 6) % 6;
      const row = p[2] > 13.5 ? 1 : 0;
      const bx = row ? Math.abs(tx - 3) : Math.min(tx, 6 - tx);
      if (bx < 0.7 && Math.abs(p[2] - (row ? 16.5 : 12)) < 0.6) return 'K';
      return p[2] > 17 ? 'S' : 'R';
    },
    (p) => (p[2] > 19.8 ? 'c' : 'M'),
  );
  // left arm, cushions, right arm (back to front)
  const armTop = (p: V3) => (p[1] > 13 ? 'a' : 'S');
  box(1, 3, 9, 4.5, 14, 15, armTop, (p) => (p[2] > 14 ? 'S' : 'R'), gold('M'));
  box(4.5, 4.5, 9, 16, 14, 12, (p) => (p[1] > 13 ? 'R' : 'S'), gold('R'), gold('M'));
  box(16, 4.5, 9, 27.5, 14, 12, (p) => (p[1] > 13 ? 'R' : 'S'), gold('R'), gold('M'));
  box(27.5, 3, 9, 31, 14, 15, armTop, (p) => (p[2] > 14 ? 'S' : 'R'), gold('M'));
  // gold scroll studs on the arm fronts
  const iso = new Iso(cv, OX, OY);
  iso.dot(2.8, 14, 12, 'a');
  iso.dot(29.2, 14, 12, 'a');
  return cv.toMap({ ...GOLD, ...VELVET }, cv.h - (OY + 12));
}

// ---------------------------------------------------------------- trading banner

const BANNER_GLYPHS: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
};

function textWidth(s: string) {
  return [...s].reduce((w, ch) => w + BANNER_GLYPHS[ch][0].length + 1, -1);
}

function bannerText(cv: PixelCanvas, s: string, x: number, y: number) {
  const ink = (key: (gy: number) => string, dx: number, dy: number) => {
    let cx = x;
    for (const ch of s) {
      const g = BANNER_GLYPHS[ch];
      g.forEach((r, gy) => [...r].forEach((c, gx) => c === '#' && cv.set(cx + gx + dx, y + gy + dy, key(gy))));
      cx += g[0].length + 1;
    }
  };
  ink(() => 'o', 1, 1);
  ink((gy) => (gy < 2 ? 'w' : gy < 5 ? 'a' : 'c'), 0, 0);
}

export const BANNER_W = 54;

function bannerFrame(frame: number): PixelMap {
  const PW = BANNER_W;
  const PH = 31;
  const flat = new PixelCanvas(PW, PH);
  const L = 4;
  const R = PW - 5;
  // cloth with a swallowtail notch, then a gold hem wherever the cloth meets its edge
  const inCloth = (x: number, y: number) => {
    if (x < L || x > R || y < 3 || y >= PH - 1) return false;
    const tail = y - (PH - 7);
    return !(tail > 0 && Math.abs(x + 0.5 - PW / 2) < tail * 3.2);
  };
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; x++) {
      if (!inCloth(x, y)) continue;
      let near = 3;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!inCloth(x + dx, y + dy)) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy)));
      flat.set(x, y, near === 1 ? 'd' : near === 2 ? 'a' : y < 8 ? 'G' : 'F');
    }
  flat.outline('o');
  // rod with ball finials
  flat.rect(1, 2, PW - 2, 2, 'o').rect(2, 2, PW - 4, 1, 'a').rect(2, 3, PW - 4, 1, 'c');
  for (const fx of [0, PW - 3]) flat.text(['.o.', 'oao', 'obo', '.o.'], fx, 1);
  // lettering and egg crests
  bannerText(flat, 'TRADING', Math.round((PW - textWidth('TRADING')) / 2), 7);
  const roomX = Math.round((PW - textWidth('ROOM')) / 2);
  bannerText(flat, 'ROOM', roomX, 16);
  for (const ex of [roomX - 7, roomX + textWidth('ROOM') + 6]) {
    layer(flat, (l) => {
      egg(l, ex, 19, 2.8, 3.8, EMERALD, 2);
      l.rect(ex - 2, 23, 5, 1, 'b').rect(ex - 1, 24, 3, 1, 'c');
    });
  }
  shimmer(flat, frame, 'ab', PW);
  // shear onto the wall's 2:1 slope
  const cv = new PixelCanvas(PW, PH + PW / 2);
  for (let yy = 0; yy < PH; yy++) for (let xx = 0; xx < PW; xx++) cv.set(xx, yy + Math.floor(xx / 2), flat.get(xx, yy));
  return cv.toMap({ ...GOLD, ...EGG_COLOURS, [SPECK]: 0xffd84a, F: 0x7a0e24, G: 0x9e1733 });
}

// ---------------------------------------------------------------- registry

export interface TradingPaintCtx {
  kind: string;
  state: string;
  frame: number;
  on: boolean;
}

export function tradingMap(c: TradingPaintCtx): PixelMap | null {
  const f12 = c.frame % 12;
  switch (c.kind) {
    case 'dragon_egg':
      return cached(`egg:${f12}`, () => dragonEggFrame(f12));
    case 'egg_stack_2':
      return cached(`egg2:${f12}`, () => eggStack2Frame(f12));
    case 'egg_stack_3':
      return cached(`egg3:${f12}`, () => eggStack3Frame(f12));
    case 'egg_wall':
      return cached('egg_wall', eggWallFrame);
    case 'gold_patch':
      return goldPatchMap();
    case 'leaf_hedge':
      return cached('leaf_hedge', hedgeFrame);
    case 'palm_planter':
      return cached('palm_planter', palmFrame);
    case 'gold_rail':
      return cached('gold_rail', railFrame);
    case 'trade_sofa':
      return cached('trade_sofa', sofaFrame);
    case 'trading_banner':
      return cached(`banner:${c.frame % 8}`, () => bannerFrame(c.frame % 8));
    default:
      return null;
  }
}

/** every frame this module draws, for tests and previews */
export function allTradingFrames(): Array<{ name: string; map: PixelMap }> {
  const out: Array<{ name: string; map: PixelMap }> = [];
  const add = (kind: string, frames: number) => {
    for (let frame = 0; frame < frames; frame++) out.push({ name: `${kind}::on:${frame}`, map: tradingMap({ kind, state: '', frame, on: true })! });
  };
  add('dragon_egg', 12);
  add('egg_stack_2', 12);
  add('egg_stack_3', 12);
  add('egg_wall', 1);
  add('gold_patch', 1);
  add('leaf_hedge', 1);
  add('palm_planter', 1);
  add('gold_rail', 1);
  add('trade_sofa', 1);
  add('trading_banner', 8);
  return out;
}
