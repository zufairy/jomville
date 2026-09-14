import { kitchen } from '@dovey/shared';
import { PixelCanvas } from '../game/pixelArt';
import { IsoSprite, cached, drum, hash, layer, orb } from './isoRaster';

/**
 * HD 8-bit kitchen items: every ingredient raw and chopped, pots through
 * filling / done / burnt, plates with every dish, plus small overlays (knife,
 * plate stack, progress ring, chef hat, tap marker). Dark ink outline and
 * 3-4 tone ramps, same look as the casino Dicemaster.
 */

export const KP: Record<string, number> = {
  o: 0x2a1a14,
  w: 0xfffdf5,
  // brushed steel
  A: 0xeef3f6,
  B: 0xc5cfd6,
  C: 0x8f9ba6,
  D: 0x5d6873,
  E: 0x3a424b,
  J: 0x1d2126,
  // honey wood + pale board wood
  e: 0xffe7bd,
  a: 0xf6c98a,
  b: 0xd99a58,
  c: 0xa8662f,
  d: 0x6e3f1d,
  // tomato
  r: 0xff8f73,
  R: 0xe8432f,
  s: 0xb02a1f,
  t: 0x6e1712,
  // lettuce
  g: 0xc8f28a,
  G: 0x7ccf4a,
  h: 0x3f9a34,
  H: 0x21602a,
  // onion
  p: 0xf3dcf6,
  P: 0xcf9bdc,
  u: 0x9a62b0,
  U: 0x5e3470,
  // mushroom
  m: 0xe8bd92,
  M: 0xb07a4f,
  n: 0x7c4e2e,
  N: 0x4a2c18,
  // ceramic / cream
  i: 0xfffaf0,
  j: 0xe6e0d4,
  k: 0xb4ab9c,
  // onion soup
  v: 0xf7d87a,
  V: 0xd9a23a,
  // brass
  '6': 0xfff1a8,
  Y: 0xf7c948,
  '7': 0xc98a1e,
  '8': 0x7a4e12,
  // flame + glow
  f: 0xfff2a8,
  F: 0xffa53b,
  x: 0xff5a1f,
  l: 0xa8e8ff,
  L: 0x3e8bff,
  // burnt + smoke
  K: 0x3c3a38,
  Z: 0x1a1816,
  q: 0xa9a9b0,
  X: 0x5f5f66,
  // brick
  I: 0xc8643f,
  W: 0x94432a,
  '9': 0x6a2e1d,
  // ready green
  T: 0x58c98b,
  y: 0x2f8f5b,
};

type Ing = kitchen.Ingredient;

const RAMP: Record<Ing, string[]> = {
  tomato: ['r', 'R', 'R', 's', 't'],
  lettuce: ['g', 'G', 'G', 'h', 'H'],
  onion: ['p', 'P', 'P', 'u', 'U'],
  mushroom: ['m', 'M', 'M', 'n', 'N'],
};

/** light / mid / dark liquid per soup */
const SOUP: Record<Ing, [string, string, string]> = {
  tomato: ['r', 'R', 's'],
  onion: ['v', 'V', '7'],
  mushroom: ['m', 'M', 'n'],
  lettuce: ['g', 'G', 'h'],
};

const sprite = (cv: PixelCanvas, ax: number, ay: number): IsoSprite => ({ map: cv.toMap(KP), ax, ay });

// ---------------------------------------------------------------- ingredients

function rawIng(ing: Ing): IsoSprite {
  const cv = new PixelCanvas(20, 19);
  layer(cv, (l) => {
    switch (ing) {
      case 'tomato':
        orb(l, 10, 11, 6.5, 5.5, RAMP.tomato);
        l.text(['..H..', 'hGhGh', '.h.h.'], 8, 4);
        break;
      case 'lettuce':
        l.ellipse(5.5, 9, 3.5, 3, 'G').ellipse(10, 7, 4, 3, 'g').ellipse(14.5, 9, 3.5, 3, 'G');
        orb(l, 10, 11.5, 7.5, 5.5, RAMP.lettuce, 'g');
        l.line(10, 16, 7, 9, 'h').line(10, 16, 13, 9, 'h').line(10, 16, 10, 8, 'g');
        break;
      case 'onion':
        orb(l, 10, 12, 6, 5, RAMP.onion);
        l.text(['..u..', '..P..', '.PPP.'], 8, 4);
        for (let y = 9; y <= 15; y++) {
          l.paint(7 - (y > 12 ? 1 : 0), y, 'P');
          l.paint(13 + (y > 12 ? 1 : 0), y, 'u');
        }
        l.set(9, 17, 'k');
        l.set(11, 17, 'k');
        break;
      case 'mushroom':
        l.rect(8, 11, 4, 6, 'i').rect(11, 11, 1, 6, 'j').rect(8, 16, 4, 1, 'j');
        l.ellipse(10, 10.5, 7.5, 5, (x, y) => (y > 10 ? null : x < 7 ? 'm' : x < 12 ? 'M' : 'n'));
        l.rect(4, 10, 13, 1, 'N');
        for (const [x, y] of [[7, 7], [12, 6], [14, 8]] as const) l.set(x, y, 'i');
        break;
    }
  });
  return sprite(cv, 10, 17);
}

function piece(l: PixelCanvas, ing: Ing, x: number, y: number, i: number) {
  switch (ing) {
    case 'tomato':
      l.ellipse(x, y, 2.6, 1.7, 'R');
      l.set(x, y, 'r');
      if (i % 2) l.set(x + 1, y, 'w');
      break;
    case 'lettuce':
      l.ellipse(x, y, 2.7, 1.6, i % 2 ? 'G' : 'g');
      l.set(x + 1, y, 'h');
      break;
    case 'onion':
      l.ellipse(x, y, 2.6, 1.7, 'p');
      l.set(x, y, 'P');
      l.set(x - 1, y, 'u');
      break;
    case 'mushroom':
      l.text(['.mm.', 'mMMn', '.ii.'], Math.round(x) - 2, Math.round(y) - 1);
      break;
  }
}

function choppedIng(ing: Ing): IsoSprite {
  const cv = new PixelCanvas(20, 19);
  const spots: Array<[number, number]> = [[9, 10], [13, 11], [6, 13], [11, 14], [15, 14]];
  spots.forEach(([x, y], i) => layer(cv, (l) => piece(l, ing, x, y, i)));
  return sprite(cv, 10, 17);
}

// ---------------------------------------------------------------- pot

export type PotPhase = 'empty' | 'fill' | 'done' | 'burnt';

export function potPhase(p: kitchen.PotItem): PotPhase {
  if (p.burnt) return 'burnt';
  if (!p.contents.length) return 'empty';
  return kitchen.potDone(p) ? 'done' : 'fill';
}

function potFrame(ing: Ing | null, n: number, phase: PotPhase, frame: number, cooking: boolean): IsoSprite {
  const W = 22;
  const cv = new PixelCanvas(W, 25);
  const cx = 11;
  const rx = 8;
  const ry = 3;
  const top = 10;
  const lidY = top + ry;
  const burnt = phase === 'burnt';
  const soup = ing ? SOUP[ing] : SOUP.tomato;
  const level = [0, 0.3, 0.45, 0.62][Math.min(3, n)];
  const liquid = (x: number, y: number): string | null => {
    const u = (x + 0.5 - cx) / rx;
    const v = (y + 0.5 - lidY) / ry;
    const d = u * u + v * v;
    if (d > 0.62) return u < -0.35 ? 'A' : u > 0.5 ? 'C' : 'B';
    if (burnt) return hash(x, y, 3) < 0.35 ? 'K' : 'Z';
    if (!n || d > level) return v < 0.1 ? 'J' : 'E';
    if (phase === 'done') return u < -0.2 && v < 0 ? soup[0] : v > 0.3 ? soup[2] : soup[1];
    return v > 0.35 ? soup[1] : soup[0];
  };
  layer(cv, (l) => {
    l.rect(1, lidY + 1, 3, 2, 'D').rect(W - 4, lidY + 1, 3, 2, 'E');
    drum(l, cx, top, rx, ry, 7, liquid, burnt ? ['C', 'D', 'D', 'E', 'J', 'J'] : ['A', 'B', 'B', 'C', 'D', 'D']);
    // a lit band under the rim
    for (let x = cx - rx + 2; x < cx; x++) l.paint(x, lidY + ry + 1, burnt ? 'C' : 'A');
  });
  if (phase === 'fill') {
    // chunks of what went in, fewer once they melt into the broth
    const chunks: Array<[number, number]> = [[8, 13], [13, 12], [11, 14]];
    for (let i = 0; i < n; i++) cv.set(chunks[i][0], chunks[i][1], soup[2]);
    if (cooking) {
      const bubbles: Array<[number, number]> = [[9, 12], [12, 13], [14, 12], [10, 14]];
      const b = bubbles[frame % bubbles.length];
      cv.set(b[0], b[1], 'w');
      const c = bubbles[(frame + 2) % bubbles.length];
      cv.set(c[0], c[1], soup[0]);
    }
  }
  if (phase === 'done') {
    cv.set(9, 12, 'w');
    // three steam wisps drifting up
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 3; k++) {
        const y = 9 - ((k * 3 + frame + i * 2) % 9);
        const x = 7 + i * 4 + (((y + i) & 2) ? 1 : 0);
        if (y >= 0) cv.set(x, y, k === 0 ? 'i' : 'j');
      }
  }
  if (burnt) {
    for (let i = 0; i < 3; i++) {
      const rise = (frame + i * 3) % 9;
      const y = 10 - rise;
      const x = 7 + i * 4 + (rise > 5 ? i - 1 : 0);
      const r = 1.4 + rise * 0.25;
      if (y - r < 0) continue;
      cv.ellipse(x, y, r, r, (px, py) => (py < y && px < x ? 'q' : 'X'));
    }
    cv.set(8, 12, 'x');
  }
  return sprite(cv, cx, 21);
}

// ---------------------------------------------------------------- plates

function plateBase(l: PixelCanvas) {
  l.ellipse(10, 12.2, 8.5, 3.3, 'k');
  l.ellipse(10, 11, 8.5, 3.3, (x, y) => {
    const u = (x + 0.5 - 10) / 8.5;
    const v = (y + 0.5 - 11) / 3.3;
    return u * u + v * v < 0.42 ? 'j' : 'i';
  });
  l.set(4, 10, 'w');
}

function plateFrame(soup: Ing | null, parts: Ing[]): IsoSprite {
  const cv = new PixelCanvas(20, 17);
  layer(cv, plateBase);
  if (soup) {
    const [lt, md, dk] = SOUP[soup];
    layer(cv, (l) =>
      drum(l, 10, 4, 5.5, 2, 3, (x, y) => {
        const u = (x + 0.5 - 10) / 5.5;
        const v = (y + 0.5 - 6) / 2;
        if (u * u + v * v > 0.55) return 'i';
        return u < -0.2 && v < 0 ? lt : v > 0.3 ? dk : md;
      }, ['i', 'i', 'j', 'k']),
    );
    cv.set(11, 6, 'G');
    cv.set(12, 6, 'h');
    cv.set(8, 5, 'w');
  } else {
    const has = (x: Ing) => parts.includes(x);
    if (has('lettuce'))
      layer(cv, (l) => {
        for (const [x, y, k] of [[7, 9, 'G'], [12, 8, 'g'], [10, 10, 'G'], [14, 10, 'h'], [6, 11, 'h']] as const) l.ellipse(x, y, 3, 2, k);
        l.set(9, 8, 'g');
      });
    if (has('tomato'))
      layer(cv, (l) => {
        for (const [x, y] of has('lettuce') ? [[9, 8], [13, 10]] : [[8, 10], [12, 9], [11, 12]]) {
          l.ellipse(x, y, 2.2, 1.5, 'R');
          l.set(x, y, 'r');
        }
      });
  }
  return sprite(cv, 10, 14);
}

// ---------------------------------------------------------------- keys

export function itemKey(item: kitchen.Item, frame = 0): string {
  switch (item.kind) {
    case 'ing':
      return `ing:${item.ing}:${item.chopped ? 'c' : 'r'}`;
    case 'plate':
      return `plate:${item.soup ?? '-'}:${[...item.parts].sort().join('+')}`;
    case 'pot': {
      const phase = potPhase(item);
      // a burnt pot is black sludge whatever went in
      if (phase === 'burnt') return `pot:burnt:${frame % 8}`;
      const cooking = phase === 'fill' && item.cook > 0;
      const animated = phase === 'done' || cooking;
      return `pot:${item.contents[0] ?? '-'}:${item.contents.length}:${phase}:${cooking ? 1 : 0}:${animated ? frame % 8 : 0}`;
    }
  }
}

/** The sprite for any item the sim can produce. `frame` animates steam, smoke and bubbles. */
export function itemSprite(item: kitchen.Item, frame = 0): IsoSprite {
  const key = itemKey(item, frame);
  return cached(key, () => {
    switch (item.kind) {
      case 'ing':
        return item.chopped ? choppedIng(item.ing) : rawIng(item.ing);
      case 'plate':
        return plateFrame(item.soup, [...item.parts].sort());
      case 'pot': {
        const phase = potPhase(item);
        return potFrame(item.contents[0] ?? null, item.contents.length, phase, frame % 8, phase === 'fill' && item.cook > 0);
      }
    }
  });
}

/** Every item state the sim can reach: ingredients, plates, pots. */
export function allItems(): kitchen.Item[] {
  const ings: Ing[] = ['tomato', 'lettuce', 'onion', 'mushroom'];
  const out: kitchen.Item[] = [];
  for (const ing of ings) for (const chopped of [false, true]) out.push({ kind: 'ing', ing, chopped });
  out.push(kitchen.emptyPlate());
  for (const soup of kitchen.SOUP_INGS) out.push({ kind: 'plate', soup, parts: [] });
  for (const parts of [['lettuce'], ['tomato'], ['lettuce', 'tomato'], ['tomato', 'lettuce']] as Ing[][]) out.push({ kind: 'plate', soup: null, parts });
  out.push(kitchen.emptyPot(), { ...kitchen.emptyPot(), burnt: true });
  const full = kitchen.COOK_PER_ING * kitchen.POT_MAX;
  for (const ing of kitchen.SOUP_INGS)
    for (let n = 1; n <= kitchen.POT_MAX; n++) {
      const contents = Array<Ing>(n).fill(ing);
      out.push({ kind: 'pot', contents, cook: 0, over: 0, burnt: false });
      out.push({ kind: 'pot', contents, cook: kitchen.COOK_PER_ING * n * 0.5, over: 0, burnt: false });
      out.push({ kind: 'pot', contents, cook: kitchen.COOK_PER_ING * n, over: 0, burnt: false });
      if (n === kitchen.POT_MAX) {
        out.push({ kind: 'pot', contents, cook: full, over: 4, burnt: false });
        out.push({ kind: 'pot', contents, cook: full, over: kitchen.BURN_AFTER, burnt: true });
      }
    }
  return out;
}

// ---------------------------------------------------------------- overlays

/** knife on a board: frame 0 lies idle, 1-3 is a chop swing */
export function knifeSprite(frame: number): IsoSprite {
  const f = Math.max(0, Math.min(3, frame));
  return cached(`knife:${f}`, () => {
    const cv = new PixelCanvas(24, 24);
    layer(cv, (l) => {
      if (f === 0) {
        for (let t = 0; t < 8; t++) {
          const x = 13 + t;
          const y = Math.round(18 - t / 2);
          l.set(x, y, 'A');
          l.set(x, y + 1, t > 5 ? '.' : 'C');
        }
        for (let t = 1; t <= 4; t++) {
          l.set(13 - t, Math.round(18 + t / 2), 'd');
          l.set(13 - t, Math.round(19 + t / 2), 'c');
        }
      } else {
        const y0 = [0, 1, 5, 9][f];
        l.rect(11, y0, 2, 4, 'c').rect(12, y0, 1, 4, 'd');
        l.rect(10, y0 + 4, 4, 7, 'B').rect(10, y0 + 4, 1, 7, 'A').rect(13, y0 + 4, 1, 7, 'C');
        l.set(10, y0 + 10, 'A');
      }
    });
    if (f === 3) for (const [x, y] of [[6, 18], [17, 17], [5, 15]] as const) cv.set(x, y, 'w');
    return sprite(cv, 12, 20);
  });
}

/** stacked clean plates; null when there are none */
export function plateStackSprite(count: number): IsoSprite | null {
  const n = Math.max(0, Math.min(5, count));
  if (!n) return null;
  return cached(`stack:${n}`, () => {
    const cv = new PixelCanvas(20, 24);
    layer(cv, (l) => {
      for (let i = 0; i < n; i++) {
        const yc = 18 - i * 2;
        l.ellipse(10, yc + 1, 8.5, 3.2, 'k');
        l.ellipse(10, yc, 8.5, 3.2, (x, y) => {
          if (i < n - 1) return y > yc ? 'j' : 'i';
          const u = (x + 0.5 - 10) / 8.5;
          const v = (y + 0.5 - yc) / 3.2;
          return u * u + v * v < 0.42 ? 'j' : 'i';
        });
      }
      l.set(4, 19 - (n - 1) * 2, 'w');
    });
    return sprite(cv, 10, 21);
  });
}

export type RingKind = 'chop' | 'cook' | 'burn';
const RING_KEYS: Record<RingKind, [string, string]> = { chop: ['Y', '7'], cook: ['T', 'y'], burn: ['R', 's'] };
export const RING_STEPS = 12;

/** progress ring, `k` of RING_STEPS segments lit, clockwise from the top */
export function ringSprite(kind: RingKind, k: number): IsoSprite {
  const steps = Math.max(0, Math.min(RING_STEPS, Math.round(k)));
  return cached(`ring:${kind}:${steps}`, () => {
    const cv = new PixelCanvas(17, 17);
    const [lit, dim] = RING_KEYS[kind];
    layer(cv, (l) =>
      l.ellipse(8.5, 8.5, 6.5, 6.5, (x, y) => {
        const dx = x + 0.5 - 8.5;
        const dy = y + 0.5 - 8.5;
        const r = Math.hypot(dx, dy);
        if (r < 3.9) return null;
        const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
        if (a >= steps / RING_STEPS) return 'E';
        return dx < -1 && dy < 1 ? lit : r > 5.6 ? dim : lit;
      }),
    );
    return sprite(cv, 8, 8);
  });
}

/** green tick shown over a finished pot */
export function readySprite(): IsoSprite {
  return cached('ready', () => {
    const cv = new PixelCanvas(13, 13);
    layer(cv, (l) => {
      l.ellipse(6.5, 6.5, 5.2, 5.2, (x, y) => (x + y < 10 ? 'T' : 'y'));
      for (const [x, y] of [[3, 6], [4, 7], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4]] as const) l.set(x, y, 'w');
    });
    return sprite(cv, 6, 12);
  });
}

/** white toque: anchor is the bottom centre of the band */
export function hatSprite(): IsoSprite {
  return cached('hat', () => {
    const cv = new PixelCanvas(20, 17);
    layer(cv, (l) => {
      l.ellipse(5.5, 7, 3.8, 3.8, 'i').ellipse(10, 5, 4.5, 4.5, 'i').ellipse(14.5, 7, 3.8, 3.8, 'i');
      l.rect(4, 8, 12, 6, 'i');
      for (let y = 3; y < 14; y++) {
        l.paint(15, y, 'j');
        l.paint(16, y, 'j');
      }
      for (let y = 10; y < 14; y++) {
        l.paint(7, y, 'j');
        l.paint(11, y, 'j');
      }
      l.rect(4, 13, 12, 1, 'k');
      l.rect(5, 9, 10, 1, 'j');
      l.set(8, 3, 'w');
      l.set(4, 6, 'w');
    });
    return sprite(cv, 10, 15);
  });
}

/** where a tap landed: a shrinking brass ring */
export function markerSprite(frame: number): IsoSprite {
  const f = Math.max(0, Math.min(2, frame));
  return cached(`marker:${f}`, () => {
    const cv = new PixelCanvas(32, 18);
    const rx = [14, 11.5, 9][f];
    const ry = rx / 2;
    layer(cv, (l) =>
      l.ellipse(16, 9, rx, ry, (x, y) => {
        const u = (x + 0.5 - 16) / rx;
        const v = (y + 0.5 - 9) / ry;
        const d = u * u + v * v;
        return d < 0.5 ? null : v < 0 ? '6' : 'Y';
      }),
    );
    return sprite(cv, 16, 9);
  });
}

/** every static overlay, for tests and previews */
export function allOverlays(): Array<{ name: string; sprite: IsoSprite }> {
  const out: Array<{ name: string; sprite: IsoSprite }> = [];
  for (let f = 0; f < 4; f++) out.push({ name: `knife:${f}`, sprite: knifeSprite(f) });
  for (let n = 1; n <= 5; n++) out.push({ name: `stack:${n}`, sprite: plateStackSprite(n)! });
  for (const kind of ['chop', 'cook', 'burn'] as RingKind[]) for (let k = 0; k <= RING_STEPS; k += 3) out.push({ name: `ring:${kind}:${k}`, sprite: ringSprite(kind, k) });
  out.push({ name: 'ready', sprite: readySprite() }, { name: 'hat', sprite: hatSprite() });
  for (let f = 0; f < 3; f++) out.push({ name: `marker:${f}`, sprite: markerSprite(f) });
  return out;
}
