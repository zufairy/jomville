import { kitchen } from '@dovey/shared';
import { PixelCanvas } from '../game/pixelArt';
import { Iso, IsoSprite, V3, cached, drum, hash, layer, orb } from './isoRaster';
import { KP } from './kitchenPixels';

/**
 * Station sprites on one tile. Anchor = the tile's top corner at floor level,
 * so the renderer places every station at tileToScreen(x, y).
 */

/** counter top height in art units */
export const ZC = 15;
const W = 36;
const OX = 18;

/** Surface height (art units) where items sit, per station kind; null when items are never shown. */
export const STATION_TOP: Record<kitchen.StationKind | 'wall', number | null> = {
  counter: ZC,
  crate: null,
  board: ZC + 1.5,
  stove: ZC + 1,
  plates: ZC,
  window: ZC,
  bin: null,
  return: ZC,
  wall: null,
};

/** sprite variants each station kind can show */
export const STATION_VARIANTS: Record<kitchen.StationKind | 'wall', readonly string[]> = {
  counter: [''],
  crate: ['tomato', 'lettuce', 'onion', 'mushroom'],
  board: [''],
  stove: ['off', 'on0', 'on1', 'on2'],
  plates: [''],
  window: ['plain', 'bell'],
  bin: ['closed', 'open1', 'open2'],
  return: [''],
  wall: [''],
};

function canvas(head: number) {
  const oy = head + ZC;
  const cv = new PixelCanvas(W, oy + 18);
  return { cv, oy, iso: new Iso(cv, OX, oy) };
}

const done = (cv: PixelCanvas, oy: number): IsoSprite => ({ map: cv.toMap(KP), ax: OX, ay: oy });

function steelLeft(p: V3): string {
  const [x, , z] = p;
  if (x < 0.8) return 'A';
  if (z > ZC - 4.2) return 'A';
  if (Math.abs(x - 8) < 0.45) return 'D';
  if (z > ZC - 6.4 && z < ZC - 5.4 && ((x > 2 && x < 6) || (x > 10 && x < 14))) return 'A';
  if (z > ZC - 7.4 && z < ZC - 6.4 && ((x > 2 && x < 6) || (x > 10 && x < 14))) return 'D';
  return hash(x * 2, z * 2, 1) < 0.1 ? 'A' : 'B';
}

function steelRight(p: V3): string {
  const [, y, z] = p;
  if (y < 0.8 || z > ZC - 4.2) return 'B';
  if (Math.abs(y - 8) < 0.45) return 'D';
  return hash(y * 2, z * 2, 2) < 0.1 ? 'D' : 'C';
}

function woodTop(p: V3): string {
  const [x, y] = p;
  if (x < 0.8 || y < 0.8) return 'e';
  const band = Math.floor(y / 2.7);
  if (y % 2.7 < 0.7 && hash(band, Math.floor(x / 5), 4) < 0.45) return 'b';
  return 'a';
}

function steelTop(p: V3): string {
  const [x, y] = p;
  if (x < 0.8 || y < 0.8) return 'w';
  return (x + y) % 7 < 1 ? 'A' : 'B';
}

/** steel cabinet under a wood (or steel) slab */
function counterBase(cv: PixelCanvas, oy: number, top: 'wood' | 'steel', front?: (p: V3) => string | null) {
  layer(cv, (l) => {
    const li = new Iso(l, OX, oy);
    li.box(1, 1, 0, 15, 15, 2, 'J', 'E', 'J');
    li.box(0, 0, 2, 16, 16, ZC - 3, 'C', (p) => front?.(p) ?? steelLeft(p), steelRight);
  });
  layer(cv, (l) => {
    const li = new Iso(l, OX, oy);
    if (top === 'wood') li.box(-0.5, -0.5, ZC - 3, 16.5, 16.5, ZC, woodTop, (p) => (p[2] > ZC - 1 ? 'a' : 'b'), (p) => (p[2] > ZC - 1 ? 'b' : 'c'));
    else li.box(-0.5, -0.5, ZC - 3, 16.5, 16.5, ZC, steelTop, (p) => (p[2] > ZC - 1 ? 'A' : 'B'), (p) => (p[2] > ZC - 1 ? 'B' : 'C'));
  });
}

function counter(): IsoSprite {
  const { cv, oy } = canvas(4);
  counterBase(cv, oy, 'wood');
  return done(cv, oy);
}

const MINI: Record<kitchen.Ingredient, { ramp: string[]; tip: string }> = {
  tomato: { ramp: ['r', 'R', 's', 't'], tip: 'h' },
  lettuce: { ramp: ['g', 'G', 'h', 'H'], tip: 'g' },
  onion: { ramp: ['p', 'P', 'u', 'U'], tip: 'u' },
  mushroom: { ramp: ['m', 'M', 'n', 'N'], tip: 'i' },
};

function crate(ing: kitchen.Ingredient): IsoSprite {
  const { cv, oy } = canvas(10);
  const zt = ZC - 2;
  layer(cv, (l) => {
    const li = new Iso(l, OX, oy);
    const slat = (along: number, z: number, lit: boolean) => {
      if (along < 1.6 || along > 14.4) return lit ? 'a' : 'b';
      if (z % 4.3 < 0.8) return 'd';
      return hash(along / 3, Math.floor(z / 4.3), lit ? 5 : 6) < 0.2 ? 'c' : lit ? 'b' : 'c';
    };
    li.box(0.5, 0.5, 0, 15.5, 15.5, zt, (p) => (p[0] < 2 || p[1] < 2 || p[0] > 14 || p[1] > 14 ? 'b' : 'd'), (p) => slat(p[0], p[2], true), (p) => slat(p[1], p[2], false));
  });
  // label card on the front
  const iso = new Iso(cv, OX, oy);
  const [lx, ly] = iso.p(8, 15.5, zt - 5);
  cv.text(['oooooo', 'oijjio', 'oi..io', 'oiijio', 'oooooo'], Math.round(lx) - 3, Math.round(ly) - 2);
  cv.rect(Math.round(lx) - 1, Math.round(ly), 2, 1, MINI[ing].ramp[1]);
  // a brimming mound of the ingredient, back to front
  const m = MINI[ing];
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) spots.push([3.2 + i * 4.8, 3.2 + j * 4.8, zt + (i === 1 && j === 1 ? 3.5 : i === 1 || j === 1 ? 2.2 : 1)]);
  spots.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  spots.forEach(([x, y, z], k) =>
    layer(cv, (l) => {
      const [sx, sy] = new Iso(l, OX, oy).p(x, y, z);
      if (ing === 'mushroom') {
        l.ellipse(sx, sy - 1, 3.2, 2.2, (px, py) => (py > sy - 1 ? 'N' : px < sx - 1 ? 'm' : 'M'));
        l.rect(Math.round(sx) - 1, Math.round(sy), 2, 2, 'i');
      } else {
        orb(l, sx, sy, ing === 'lettuce' ? 3.6 : 3.1, ing === 'lettuce' ? 2.8 : 2.6, m.ramp, k % 2 ? '' : 'w');
        l.set(Math.round(sx), Math.round(sy - 2.6), m.tip);
      }
    }),
  );
  return done(cv, oy);
}

function board(): IsoSprite {
  const { cv, oy } = canvas(4);
  counterBase(cv, oy, 'wood');
  layer(cv, (l) =>
    new Iso(l, OX, oy).box(2.5, 2.5, ZC, 13.5, 13.5, ZC + 1.5, (p) => {
      if (p[0] < 3.3 || p[1] < 3.3) return 'w';
      if (Math.abs(p[0] - 12) < 0.4 || Math.abs(p[1] - 12) < 0.4) return 'a';
      return hash(p[0], p[1] / 3, 7) < 0.08 ? 'a' : 'e';
    }, 'a', 'b'),
  );
  return done(cv, oy);
}

function stove(variant: string): IsoSprite {
  const on = variant.startsWith('on');
  const frame = on ? Number(variant.slice(2)) || 0 : 0;
  const { cv, oy } = canvas(8);
  const zt = ZC - 1;
  layer(cv, (l) => {
    const li = new Iso(l, OX, oy);
    li.box(0, 0, 0, 16, 16, zt, (p) => {
      const d = Math.hypot(p[0] - 8, p[1] - 8);
      if (p[0] < 1 || p[1] < 1) return 'B';
      if (p[0] > 15 || p[1] > 15) return 'D';
      if (Math.abs(d - 5.6) < 0.6) return 'C';
      if (d < 7 && (Math.abs(p[0] - 8) < 0.45 || Math.abs(p[1] - 8) < 0.45)) return 'C';
      if (on && d < 3.2) return frame % 2 ? 'x' : 'F';
      return 'J';
    }, (p) => {
      const [x, , z] = p;
      if (z < 1.5) return 'J';
      if (z > zt - 3 && z < zt - 1.4) return [3, 6, 10, 13].some((k) => Math.abs(x - k) < 0.8) ? 'Y' : 'E';
      if (z > zt - 5 && z < zt - 4.2 && x > 3 && x < 13) return 'A';
      if (x > 2 && x < 14 && z > 2.5 && z < zt - 5.6) {
        if (x < 3.2 || x > 12.8 || z < 3.6 || z > zt - 6.6) return 'E';
        if (on) return z < 6 ? 'x' : (x + z) % 5 < 1 ? 'f' : 'F';
        return x - z > 2 && x - z < 3.5 ? 'D' : 'J';
      }
      return x < 0.8 ? 'C' : 'D';
    }, (p) => (p[2] < 1.5 ? 'J' : p[1] < 0.8 ? 'D' : 'E'));
  });
  if (on) {
    // ring of flame tongues around the burner, blue at the root, orange tips
    const iso = new Iso(cv, OX, oy);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const [sx, sy] = iso.p(8 + Math.cos(a) * 6.2, 8 + Math.sin(a) * 6.2, zt);
      const tall = 1 + Math.floor(hash(i, frame, 9) * 3);
      const x = Math.round(sx);
      const y = Math.round(sy);
      cv.set(x, y, 'L');
      if (tall > 1) cv.set(x, y - 1, 'l');
      if (tall > 2) cv.set(x, y - 2, i % 2 ? 'F' : 'f');
    }
  }
  return done(cv, oy);
}

function plates(): IsoSprite {
  const { cv, oy } = canvas(4);
  counterBase(cv, oy, 'steel');
  return done(cv, oy);
}

function returnHatch(): IsoSprite {
  const { cv, oy } = canvas(4);
  counterBase(cv, oy, 'steel', (p) => {
    // a brass "return" arrow on the front
    const [x, , z] = p;
    const cx = x - 8;
    const cz = z - (ZC - 8);
    if (Math.abs(cz) < 0.6 && cx > -3 && cx < 3) return 'Y';
    if (cx < -1.5 && cx > -3.5 && Math.abs(cz) < 1.8 - (-1.5 - cx) * 0.9) return 'Y';
    return null;
  });
  layer(cv, (l) =>
    new Iso(l, OX, oy).face(
      [
        [3, 3, ZC],
        [13, 3, ZC],
        [13, 13, ZC],
        [3, 13, ZC],
      ],
      (p) => (p[0] < 3.8 || p[1] < 3.8 ? 'E' : Math.floor(p[0]) % 2 ? 'D' : 'J'),
    ),
  );
  return done(cv, oy);
}

function servingWindow(variant: string): IsoSprite {
  const { cv, oy } = canvas(14);
  counterBase(cv, oy, 'steel', (p) => (p[2] > ZC - 5.2 && p[2] < ZC - 3.8 ? (p[0] < 1 ? '6' : 'Y') : null));
  if (variant === 'bell') {
    const [bx, by] = new Iso(cv, OX, oy).p(11, 11, ZC);
    layer(cv, (l) => {
      l.ellipse(bx, by, 3.5, 1.6, 'E');
      orb(l, bx, by - 3, 3, 3, ['6', 'Y', '7', '8'], 'w');
      l.rect(Math.round(bx) - 3, Math.round(by) - 1, 7, 1, '7');
      l.set(Math.round(bx), Math.round(by) - 7, 'Y');
    });
  }
  return done(cv, oy);
}

function bin(variant: string): IsoSprite {
  const { cv, oy } = canvas(18);
  const cx = OX;
  const rx = 7;
  const ry = 3.5;
  const h = ZC - 4;
  const top = oy + 8 - ry - h;
  const rimY = top + ry;
  const open = variant !== 'closed';
  if (open) {
    const lift = variant === 'open1' ? 5 : 9;
    const lry = variant === 'open1' ? 5 : 7;
    layer(cv, (l) => {
      l.ellipse(cx, rimY - lift, rx + 0.5, lry, (x, y) => (y < rimY - lift - lry * 0.4 ? 'A' : x < cx ? 'B' : 'C'));
      l.rect(cx - 1, rimY - lift - lry - 1, 2, 1, 'D');
    });
  }
  layer(cv, (l) => {
    drum(l, cx, top, rx, ry, h, (x, y) => {
      if (!open) return null;
      const u = (x + 0.5 - cx) / rx;
      const v = (y + 0.5 - rimY) / ry;
      return u * u + v * v > 0.6 ? 'B' : v < 0 ? 'J' : 'E';
    }, ['A', 'B', 'B', 'C', 'D', 'D']);
    for (let x = cx - rx + 1; x < cx + rx; x++) {
      l.paint(x, rimY + ry + 2, 'D');
      l.paint(x, oy + 8 + ry - 3, 'D');
    }
    l.rect(cx - 2, oy + 8 + ry - 1, 4, 2, 'E');
  });
  if (!open)
    layer(cv, (l) => {
      l.ellipse(cx, rimY - 1, rx + 0.5, ry + 0.3, (x, y) => (y < rimY - 1 && x < cx ? 'A' : 'B'));
      l.rect(cx - 1, rimY - 3, 3, 1, 'D');
    });
  return done(cv, oy);
}

function wallCap(): IsoSprite {
  const { cv, oy } = canvas(4);
  const brick = (along: number, z: number, lit: boolean) => {
    const row = Math.floor(z / 3);
    const off = row % 2 ? 3 : 0;
    if (z % 3 < 0.7 || (along + off) % 6 < 0.7) return 'k';
    return hash(Math.floor((along + off) / 6), row, lit ? 1 : 2) < 0.3 ? (lit ? 'W' : '9') : lit ? 'I' : 'W';
  };
  layer(cv, (l) => new Iso(l, OX, oy).box(0, 0, 0, 16, 16, ZC - 1, 'W', (p) => brick(p[0], p[2], true), (p) => brick(p[1], p[2], false)));
  layer(cv, (l) => new Iso(l, OX, oy).box(-0.5, -0.5, ZC - 1, 16.5, 16.5, ZC + 1, (p) => (p[0] < 1 || p[1] < 1 ? 'b' : 'c'), 'c', 'd'));
  return done(cv, oy);
}

/** base sprite for a station kind and variant (see STATION_VARIANTS) */
export function stationSprite(kind: kitchen.StationKind | 'wall', variant = ''): IsoSprite {
  return cached(`station:${kind}:${variant}`, () => {
    switch (kind) {
      case 'counter':
        return counter();
      case 'crate':
        return crate((STATION_VARIANTS.crate.includes(variant) ? variant : 'tomato') as kitchen.Ingredient);
      case 'board':
        return board();
      case 'stove':
        return stove(variant);
      case 'plates':
        return plates();
      case 'window':
        return servingWindow(variant);
      case 'bin':
        return bin(STATION_VARIANTS.bin.includes(variant) ? variant : 'closed');
      case 'return':
        return returnHatch();
      case 'wall':
        return wallCap();
    }
  });
}

export interface StationLook {
  /** ms clock for flame flicker */
  now: number;
  /** a neighbour on the left is also a window (the bell sits on the first one) */
  windowRun: boolean;
  /** ms since something was binned, Infinity when idle */
  binnedAgo: number;
}

/** which variant a live station shows */
export function stationVariant(st: Pick<kitchen.Station, 'kind' | 'ing' | 'item'>, look: StationLook): string {
  switch (st.kind) {
    case 'crate':
      return st.ing ?? 'tomato';
    case 'stove': {
      const pot = st.item?.kind === 'pot' ? st.item : null;
      const lit = !!pot && pot.contents.length > 0 && !pot.burnt;
      return lit ? `on${Math.floor(look.now / 110) % 3}` : 'off';
    }
    case 'window':
      return look.windowRun ? 'plain' : 'bell';
    case 'bin':
      return look.binnedAgo < 120 ? 'open1' : look.binnedAgo < 420 ? 'open2' : look.binnedAgo < 560 ? 'open1' : 'closed';
    default:
      return '';
  }
}

/** every station sprite, for tests and previews */
export function allStationSprites(): Array<{ name: string; sprite: IsoSprite }> {
  const out: Array<{ name: string; sprite: IsoSprite }> = [];
  for (const kind of Object.keys(STATION_VARIANTS) as Array<keyof typeof STATION_VARIANTS>)
    for (const v of STATION_VARIANTS[kind]) out.push({ name: `${kind}:${v}`, sprite: stationSprite(kind, v) });
  return out;
}
