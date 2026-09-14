import { PixelCanvas, PixelMap } from './pixelArt';
import { GOLD, Iso, Pt, V3, cached, drum, hash, layer, mixHex, orb, shadeHex, shimmer } from './pixelKit';
import { allTradingFrames, tradingMap } from './tradingPixels';

/**
 * Pixel-art frames for the casino set, built on a small iso raster so every
 * piece shares the same 2:1 edges, dark outline and 3-4 tone ramps. Frames are
 * generated on first use and cached; keys match artStateKey ('0', '-1', faces,
 * holodice numbers) plus the client-only dicemaster lid and holodice lock-in keys.
 */


const IVORY = { i: 0xfffbea, j: 0xeae0c2, k: 0xc9b98f, p: 0x3a2320, r: 0xc8102e };

// ---------------------------------------------------------------- dicemaster

/** pip cells on a die face, [col, row] in a 3x3 grid */
export const DIE_PIPS: Record<string, Array<[number, number]>> = {
  '1': [[1, 1]],
  '2': [[0, 0], [2, 2]],
  '3': [[0, 0], [1, 1], [2, 2]],
  '4': [[0, 0], [2, 0], [0, 2], [2, 2]],
  '5': [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  '6': [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

export function dicePips(face: string): Array<[number, number]> {
  return DIE_PIPS[face] ?? [];
}

/** client-only lid swing keys, opening order */
export const LID_OPEN = ['open1', 'open2', 'open3'] as const;
export const LID_CLOSE = ['close1', 'close2', 'close3'] as const;
const LID_ANGLE: Record<string, number> = { open1: 25, open2: 55, open3: 85, close1: 85, close2: 55, close3: 25 };

const DM = { W: 26, H: 38, OX: 12, OY: 28, BX: 12, BY: 10, ZB: 6, ZT: 13 };

/** front-left face: honey wood bands running along the box, with a diagonal shine */
function dmLeft(p: V3): string {
  const v = DM.ZT - p[2];
  const x = p[0];
  if (x < 1) return v < 1.5 ? 'b' : 'c';
  if (x < 2) return v < 1 ? 'w' : 'a';
  const s = x - v * 1.1;
  if ((s > 4.4 && s < 5.6) || (s > 6.6 && s < 7.2)) return 'w';
  const band = ['w', 'a', 'b', 'a', 'a', 'b', 'c'][Math.floor(v)] ?? 'c';
  if (band !== 'w' && hash(x * 0.5, v, 7) < 0.1) return band === 'a' ? 'b' : 'c';
  return band;
}

function dmRight(p: V3): string {
  const v = DM.ZT - p[2];
  const band = ['b', 'c', 'd', 'c', 'c', 'd', 'e'][Math.floor(v)] ?? 'e';
  if (p[1] < 1) return 'd';
  return hash(p[1], v, 3) < 0.1 ? 'e' : band;
}

function dmStand(cv: PixelCanvas, iso: Iso) {
  layer(cv, (l) => {
    const li = new Iso(l, iso.ox, iso.oy);
    // central post, dark wood with a lit left edge
    li.box(4.5, 3.5, 2, 7.5, 6.5, DM.ZB + 1, 'd', (p) => (p[0] < 5.5 ? 'c' : p[0] > 6.5 ? 'e' : 'd'), (p) => (p[1] < 4.5 ? 'e' : 'f'));
    // two arched legs facing the camera, flaring out to the feet
    const [cx, cy] = li.p(DM.BX / 2, DM.BY / 2, 0);
    const span = 10;
    const rise = 3;
    for (let sx = -span; sx <= span; sx++) {
      const u = sx / span;
      const topY = Math.round(cy + 1 - rise * (1 - u * u));
      const thick = 2 + Math.round(1.5 * (1 - Math.abs(u)));
      for (let k = 0; k < thick; k++) {
        const key = k === 0 ? (u < 0.2 ? 'a' : 'b') : k === thick - 1 ? 'e' : u < 0 ? 'c' : 'd';
        l.set(cx + sx, topY + k, key);
      }
    }
    l.rect(cx - span - 1, cy + 2, 2, 1, 'd').rect(cx + span, cy + 2, 2, 1, 'e');
  });
}

/** body faces below the rim; `interior` also draws the dark inside */
function dmBody(cv: PixelCanvas, iso: Iso, dy: number, dx: number, interior: boolean, die?: string) {
  if (interior) {
    layer(cv, (l) => new Iso(l, iso.ox, iso.oy).face([[0, 0, DM.ZT], [DM.BX, 0, DM.ZT], [DM.BX, DM.BY, DM.ZT], [0, DM.BY, DM.ZT]], (p) => (p[1] < 1.5 || p[0] < 1.5 ? 'e' : 'f')), 'o', dx, dy);
    if (die) dmDie(cv, iso, die, dx, dy);
  }
  layer(
    cv,
    (l) => {
      const li = new Iso(l, iso.ox, iso.oy);
      li.face([[0, DM.BY, DM.ZB], [DM.BX, DM.BY, DM.ZB], [DM.BX, DM.BY, DM.ZT], [0, DM.BY, DM.ZT]], dmLeft);
      li.face([[DM.BX, 0, DM.ZB], [DM.BX, DM.BY, DM.ZB], [DM.BX, DM.BY, DM.ZT], [DM.BX, 0, DM.ZT]], dmRight);
    },
    'o',
    dx,
    dy,
  );
  if (interior) {
    // lit rim along the open top edge
    const rim = new Iso(cv, iso.ox + dx, iso.oy + dy);
    for (let x = 1; x < DM.BX; x += 0.5) rim.dot(x, DM.BY, DM.ZT - 0.5, x < 7 ? 'w' : 'a');
    for (let y = 1; y < DM.BY; y += 0.5) rim.dot(DM.BX, y, DM.ZT - 0.5, 'b');
  }
  dmHardware(cv, iso, dx, dy);
}

/** round brass latch on the front, hinge knob on the right side */
function dmHardware(cv: PixelCanvas, iso: Iso, dx: number, dy: number) {
  const [lx, ly] = iso.p(3, DM.BY, DM.ZT - 3.5);
  cv.text(['.oo.', 'owbo', 'obdo', '.oo.'], Math.round(lx) - 2 + dx, Math.round(ly) - 2 + dy);
  const [hx, hy] = iso.p(DM.BX, 3, DM.ZT - 3.5);
  cv.text(['.o.', 'oao', 'odo', '.o.'], Math.round(hx) - 1 + dx, Math.round(hy) - 2 + dy);
}

/** ivory die filling the box opening, top face showing `face` with 2x2 pips */
function dmDie(cv: PixelCanvas, iso: Iso, face: string, dx: number, dy: number) {
  const [x0, y0, x1, y1] = [1, 0, 11, 10];
  const z0 = DM.ZT - 3;
  const z1 = DM.ZT + 2;
  layer(
    cv,
    (l) => {
      const li = new Iso(l, iso.ox, iso.oy);
      li.box(x0, y0, z0, x1, y1, z1, (p) => (p[0] > x1 - 1 || p[1] > y1 - 1 ? 'j' : 'i'), (p) => (p[2] > z1 - 1 ? 'i' : 'j'), (p) => (p[2] > z1 - 1 ? 'j' : 'k'));
      for (const [col, row] of dicePips(face)) {
        const [sx, sy] = li.p(x0 + 2 + col * 3, y0 + 2 + row * 3, z1);
        l.rect(Math.floor(sx) - 1, Math.floor(sy) - 1, 2, 2, face === '1' ? 'r' : 'p');
      }
    },
    'o',
    dx,
    dy,
  );
}

/** lid slab hinged along the back edge (y=0), swung up by `deg` */
function dmLid(cv: PixelCanvas, iso: Iso, deg: number, dx: number, dy: number) {
  const a = (deg * Math.PI) / 180;
  const T = 2;
  const L = DM.BY + 0.3;
  const u: V3 = [0, Math.cos(a), Math.sin(a)];
  const n: V3 = [0, -Math.sin(a), Math.cos(a)];
  const P = (x: number, s: number, t: number): V3 => [x, u[1] * s + n[1] * t, DM.ZT + u[2] * s + n[2] * t];
  const [xa, xb] = [-0.3, DM.BX + 0.3];
  const outer = (p: V3) => {
    const s = p[1] * u[1] + (p[2] - DM.ZT) * u[2];
    if (s > L - 1.2) return 'w';
    if (p[0] < 1.5) return 'b';
    const k = p[0] - (L - s) * 1.1;
    if (k > 4.4 && k < 5.6) return 'w';
    return ['a', 'b', 'a', 'a', 'b', 'a', 'b', 'b', 'c', 'c', 'c'][Math.floor(L - s)] ?? 'c';
  };
  const inner = (p: V3) => (p[0] < 1.2 || p[0] > DM.BX - 1.2 ? 'd' : hash(p[0], p[2]) < 0.15 ? 'f' : 'e');
  layer(
    cv,
    (l) => {
      new Iso(l, iso.ox, iso.oy).solid([
        { pts: [P(xa, 0, T), P(xb, 0, T), P(xb, L, T), P(xa, L, T)], shader: outer },
        { pts: [P(xa, 0, 0), P(xb, 0, 0), P(xb, L, 0), P(xa, L, 0)], shader: inner },
        { pts: [P(xa, L, 0), P(xb, L, 0), P(xb, L, T), P(xa, L, T)], shader: (p) => (p[0] < 2 ? 'a' : 'b') },
        { pts: [P(xa, 0, 0), P(xb, 0, 0), P(xb, 0, T), P(xa, 0, T)], shader: 'd' },
        { pts: [P(xb, 0, 0), P(xb, L, 0), P(xb, L, T), P(xb, 0, T)], shader: (p) => (p[2] > DM.ZT + 1 ? 'c' : 'd') },
        { pts: [P(xa, 0, 0), P(xa, L, 0), P(xa, L, T), P(xa, 0, T)], shader: 'c' },
      ]);
    },
    'o',
    dx,
    dy,
  );
}

function dmFrame(key: string, frame: number): PixelMap {
  const cv = new PixelCanvas(DM.W, DM.H);
  const iso = new Iso(cv, DM.OX, DM.OY);
  const foot = DM.H - (DM.OY + (DM.BX / 2 + DM.BY / 2) / 2);
  dmStand(cv, iso);
  const face = /^[1-6]$/.test(key) ? key : '';
  const angle = face ? 108 : (LID_ANGLE[key] ?? 0);
  if (key === '-1') {
    // shut and rattling: the box hops off its stand, dust puffs when it lands
    const hop = [0, 1, 2, 1, 0, 1, 0, 0][frame % 8];
    const jig = [0, 1, 0, -1, 0, 1, 0, -1][frame % 8];
    dmBody(cv, iso, -hop, jig, false);
    dmLid(cv, iso, 0, jig, -hop);
    if (hop === 0) {
      const puffs: Pt[] = frame % 2 ? [[1, 36], [24, 35], [3, 34]] : [[2, 35], [23, 36], [22, 34]];
      for (const [x, y] of puffs) cv.set(x, y, 'j');
    }
    if (hop >= 1) for (const [x, y] of [[3, 12 - hop], [21, 9 - hop], [17, 6 - hop]] as Pt[]) cv.set(x, y, frame % 2 ? 'a' : 'w');
  } else if (angle >= 70) {
    dmLid(cv, iso, angle, 0, 0);
    dmBody(cv, iso, 0, 0, true, face || undefined);
  } else if (angle > 0) {
    dmBody(cv, iso, 0, 0, true, undefined);
    dmLid(cv, iso, angle, 0, 0);
  } else {
    dmBody(cv, iso, 0, 0, false);
    dmLid(cv, iso, 0, 0, 0);
  }
  return cv.toMap({ ...GOLD, ...IVORY }, foot);
}

export function dicemasterMap(key: string, frame = 0): PixelMap {
  const k = key === '-1' ? key : key || '0';
  return cached(`dicemaster:${k}:${k === '-1' ? frame % 8 : 0}`, () => dmFrame(k, frame));
}


// ---------------------------------------------------------------- holodice

/**
 * Hologram digit cores, 3x5, with clipped corners so they read as a little
 * 8-bit display font rather than plain blocks. holoGlyph adds the dim bevel.
 */
export const HOLO_FONT: Record<string, string[]> = {
  '0': ['.#.', '#.#', '#.#', '#.#', '.#.'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '##.', '#.#', '.#.'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['.#.', '#.#', '.#.', '#.#', '.#.'],
  '9': ['.#.', '#.#', '.##', '..#', '##.'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
};

/** a 4x6 glyph: lit core '#' plus a dim bevel '+' dropped one pixel down-right */
export function holoGlyph(ch: string): string[] {
  const core = HOLO_FONT[ch] ?? HOLO_FONT['?'];
  const out = Array.from({ length: 6 }, () => ['.', '.', '.', '.']);
  core.forEach((r, y) => [...r].forEach((k, x) => k === '#' && (out[y][x] = '#')));
  core.forEach((r, y) => [...r].forEach((k, x) => k === '#' && out[y + 1][x + 1] === '.' && (out[y + 1][x + 1] = '+')));
  return out.map((r) => r.join(''));
}

/** idle loop frames for a shown number (gentle pulse + scrolling scanline) */
export const HOLO_IDLE_FRAMES = 4;
export const HOLO_LOCK = ['lock1', 'lock2', 'lock3'] as const;

/**
 * Normalised holodice art key: '0' closed, '-1' rolling, 'N' a shown number
 * (1-100), or a client-only lock-in key 'lockK:N'.
 */
export function holoKey(state: string | undefined): string {
  const s = state || '0';
  if (s === '-1' || s === '0') return s;
  const m = /^(lock[123]:)?(\d{1,3})$/.exec(s);
  if (!m) return '0';
  const n = Number(m[2]);
  return n >= 1 && n <= 100 ? `${m[1] ?? ''}${n}` : '0';
}

/** client-only lock-in pop when a roll lands, or null when none plays */
export function holoLockSequence(from: string, to: string): readonly string[] | null {
  const k = holoKey(to);
  return from === '-1' && /^\d+$/.test(k) && k !== '0' ? HOLO_LOCK.map((l) => `${l}:${k}`) : null;
}

/** glass edge light, top, left and right faces, outer glow, hologram core, core peak */
const HOLO_TINT: Record<string, [number, number, number, number, number, number, number]> = {
  '0': [0x8d88ad, 0x3d3859, 0x2e2a47, 0x221f37, 0x5a5480, 0x6d6890, 0x9a95c0],
  lo: [0xbffbff, 0x1d5b74, 0x15455b, 0x0f3447, 0x5ef2ff, 0x6ff4ff, 0xe8ffff],
  mid: [0xe9d8ff, 0x472d78, 0x382360, 0x2a1a4a, 0xc49bff, 0xc9a6ff, 0xf7eeff],
  hi: [0xfff1b0, 0x6a4712, 0x53380e, 0x3f2a0a, 0xffd35a, 0xffdf78, 0xfffbe2],
};

const holoBand = (n: number) => (n <= 0 ? '0' : n <= 33 ? 'lo' : n <= 66 ? 'mid' : 'hi');

function holodiceFrame(key: string, frame: number): PixelMap {
  const OX = 14;
  const OY = 28;
  const cv = new PixelCanvas(28, 42);
  const iso = new Iso(cv, OX, OY);
  const rolling = key === '-1';
  const lock = /^lock([123]):(\d+)$/.exec(key);
  const stage = lock ? Number(lock[1]) : 0;
  const shown = lock ? Number(lock[2]) : rolling || key === '0' ? 0 : Number(key);
  const scramble = rolling ? 1 + Math.floor(hash(frame, 17, 5) * 100) : 0;
  const band = rolling ? ['lo', 'mid', 'hi'][Math.floor(frame / 3) % 3] : holoBand(shown);
  const [edgeC, topC, leftC, rightC, glowC, coreC, peakC] = HOLO_TINT[band];
  const hop = rolling ? [0, 1, 3, 4, 3, 1, 0, 0][frame % 8] : stage === 1 ? 1 : 0;

  // gold pedestal with a stepped cap as wide as the cube
  layer(cv, (l) => {
    const li = new Iso(l, OX, OY);
    li.box(5, 5, 0, 11, 11, 5, 'b', (p) => (p[2] > 3.5 ? 'a' : p[0] < 6 ? 'b' : 'c'), (p) => (p[2] > 3.5 ? 'c' : 'd'));
    li.box(3.5, 3.5, 5, 12.5, 12.5, 6.5, (p) => (p[0] < 4.5 || p[1] < 4.5 ? 'w' : 'a'), 'b', 'd');
  });
  iso.dot(8, 11, 2.5, 'e', 2);

  // dark glass cube; its edge pixels are kept aside and laid back over the hologram
  const C0 = 3.5;
  const C1 = 12.5;
  const Z0 = 8;
  const Z1 = 17;
  const E = 0.8;
  // bright rim only on the silhouette; the three front edges stay dim so they never hide the number
  const cube = new PixelCanvas(cv.w, cv.h);
  new Iso(cube, OX, OY - hop).box(
    C0, C0, Z0, C1, C1, Z1,
    (p) => (p[0] < C0 + E || p[1] < C0 + E ? 'x' : p[0] > C1 - E || p[1] > C1 - E ? 'D' : 'y'),
    (p) => (p[0] < C0 + E || p[2] < Z0 + E ? 'x' : p[0] > C1 - E || p[2] > Z1 - E ? 'D' : 'z'),
    (p) => (p[1] < C0 + E || p[2] < Z0 + E ? 'x' : p[1] > C1 - E || p[2] > Z1 - E ? 'D' : 'q'),
  );
  const [gx, gy] = new Iso(cube, OX, OY - hop).p(5, C1, Z1 - 1);
  for (let s = 0; s < 3; s++) cube.paint(gx + 1 + s, gy + s, 'x');
  const edges = cube.clone();
  const glass = (k: string) => k === 'y' || k === 'z' || k === 'q';
  const faceUnder = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (const k of [cube.get(x, y + dy), cube.get(x - 1, y), cube.get(x + 1, y)]) if (glass(k)) return k;
    return 'z';
  };
  if (rolling || shown) {
    const halo = cube.clone().outline('g');
    if (stage === 1) halo.outline('g');
    if (!rolling || frame % 2 === 0) cv.stamp(halo);
  }
  cube.outline('n');
  for (let y = 0; y < cube.h; y++) for (let x = 0; x < cube.w; x++) if (cube.get(x, y) === 'x') cube.set(x, y, faceUnder(x, y));
  cv.stamp(cube);

  // scanlines on the glass: one faint line when closed, scrolling bands when lit, a sweep while rolling
  const top = Math.round(OY - hop - (Z1 - C0) + 0.5);
  const bottom = Math.round(OY - hop + C1 - Z0);
  const lit: Record<string, string> = { y: 'T', z: 'U', q: 'V', D: 'U' };
  const scan = (y: number) => {
    for (let x = 0; x < cv.w; x++) if (lit[cv.get(x, y)] && cube.get(x, y) !== 'n') cv.set(x, y, lit[cv.get(x, y)]);
  };
  if (!rolling && !shown) scan(OY - 4);
  else if (rolling) scan(top + ((frame * 3) % (bottom - top)));
  else for (let y = top + 1; y < bottom; y++) if ((y + frame) % 4 === 0) scan(y);

  // the hologram number, centred mid-cube so the front edge crosses a bevel column
  const text = rolling ? (frame % 4 === 3 ? '??' : String(scramble)) : shown ? String(shown) : '';
  if (text) {
    const holo = new PixelCanvas(cv.w, cv.h);
    const x0 = text.length === 3 ? OX - 7 : text.length === 2 ? OX - 3 : OX - 3;
    const y0 = OY - hop - 8;
    [...text].forEach((ch, i) =>
      holoGlyph(ch).forEach((r, gy) => [...r].forEach((k, gxx) => k !== '.' && holo.set(x0 + i * 4 + gxx, y0 + gy, k === '#' ? 'H' : 'J'))),
    );
    // glitch: while rolling one row band slips sideways
    if (rolling && frame % 2 === 1) {
      const band = y0 + ((frame >> 1) % 3) * 2;
      for (const y of [band, band + 1]) {
        const row = Array.from({ length: holo.w }, (_, x) => holo.get(x, y));
        for (let x = 0; x < holo.w; x++) holo.set(x, y, row[x - 1] ?? '.');
      }
    }
    const ring = holo.clone().outline('h');
    const halo: Record<string, string> = { y: 'K', z: 'L', q: 'M', T: 'K', U: 'L', V: 'M', D: 'L' };
    for (let y = 0; y < cv.h; y++)
      for (let x = 0; x < cv.w; x++) {
        const k = ring.get(x, y);
        if (k === 'h' && halo[cv.get(x, y)]) cv.set(x, y, halo[cv.get(x, y)]);
        else if (k === 'H' || k === 'J') {
          const scanRow = !rolling && stage === 0 && (y + frame) % 4 === 0;
          cv.set(x, y, k === 'H' ? (stage === 1 ? 'W' : scanRow ? 'I' : 'H') : 'J');
        }
      }
    // the front glass edge and glint sit in front of the hologram (never over its lit core)
    for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) if (edges.get(x, y) === 'x' && cv.get(x, y) !== 'H' && cv.get(x, y) !== 'W' && cv.get(x, y) !== 'I') cv.set(x, y, 'x');
  } else for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) if (edges.get(x, y) === 'x') cv.set(x, y, 'x');

  if (rolling)
    for (let i = 0; i < 4; i++) {
      const a = ((frame + i * 2) / 8) * Math.PI * 2;
      cv.set(OX + Math.round(Math.cos(a) * 11), OY - 7 - hop + Math.round(Math.sin(a) * 4), i % 2 ? 'g' : 'x');
    }

  // lock-in pop: flash bright, then settle; idle: the core breathes
  const pulse = rolling ? 0.2 : stage === 1 ? 1 : stage === 2 ? 0.7 : stage === 3 ? 0.4 : [0, 0.25, 0.5, 0.25][frame % 4];
  const faceLift = stage === 1 ? 0.3 : stage === 2 ? 0.15 : 0;
  const face = (c: number) => mixHex(c, glowC, faceLift);
  const core = mixHex(coreC, peakC, pulse);
  return cv.toMap(
    {
      ...GOLD,
      x: edgeC,
      y: face(topC),
      z: face(leftC),
      q: face(rightC),
      n: shadeHex(rightC, 0.55),
      g: glowC,
      H: core,
      I: mixHex(core, leftC, 0.25),
      J: mixHex(coreC, leftC, 0.55),
      W: 0xffffff,
      D: mixHex(face(leftC), edgeC, 0.3),
      K: mixHex(glowC, face(topC), 0.62),
      L: mixHex(glowC, face(leftC), 0.62),
      M: mixHex(glowC, face(rightC), 0.62),
      T: mixHex(face(topC), edgeC, 0.12),
      U: mixHex(face(leftC), edgeC, 0.12),
      V: mixHex(face(rightC), edgeC, 0.12),
    },
    cv.h - (OY + 8),
  );
}

// ---------------------------------------------------------------- wheel of fortune

const WHEEL_KEYS = ['R', 'K', 'Y', 'G', 'R', 'K', 'C', 'V'];
const WHEEL_PAL = { R: 0xd21a36, K: 0x2a2446, Y: 0xf7c948, G: 0x22915a, C: 0x5ee6f2, V: 0xb58cff, M: 0x8e0f24, i: 0xfffbea, j: 0xeae0c2 };

export function wheelRotation(key: string, frame: number): number {
  if (key === '-1') return -(frame / 12) * Math.PI * 2;
  const n = Number(key);
  return n >= 1 && n <= 8 ? -((n - 1) / 8) * Math.PI * 2 : 0;
}

/** which segment sits under the top pointer for a rotation */
export function wheelSegmentAtPointer(rot: number): number {
  const TAU = Math.PI * 2;
  const a = (((-rot) % TAU) + TAU) % TAU;
  return (Math.round(a / (TAU / 8)) % 8) + 1;
}

function wheelFrame(key: string, frame: number): PixelMap {
  const OY = 36;
  const cv = new PixelCanvas(40, 58);
  const groundY = OY + 12;
  const cx = 20;
  const cy = groundY - 28;
  const R = 14;
  // red lacquer base with gold trim
  layer(cv, (l) => {
    const li = new Iso(l, 12, OY);
    li.box(4, 4, 0, 28, 12, 5, 'M', (p) => (p[2] > 3.5 ? 'b' : p[2] < 1 ? 'd' : 'R'), (p) => (p[2] > 3.5 ? 'c' : 'M'));
    li.box(6, 6, 5, 26, 10, 6.5, 'a', 'b', 'd');
  });
  // A-frame struts
  layer(cv, (l) => {
    for (const s of [-1, 1]) for (let t = 0; t < 2; t++) l.line(cx + s * (9 + t), groundY - 6, cx + s * t, cy, t ? 'c' : 'b');
  });
  const rot = wheelRotation(key, frame);
  const TAU = Math.PI * 2;
  layer(cv, (l) => {
    l.ellipse(cx, cy, R + 0.5, R + 0.5, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      if (r > R - 2) return r > R - 0.8 ? 'd' : 'b';
      if (r < 2.6) return r < 1.5 ? 'w' : 'c';
      const a = (((Math.atan2(dy, dx) + Math.PI / 2 + TAU / 16 - rot) % TAU) + TAU) % TAU;
      const seg = Math.floor(a / (TAU / 8)) % 8;
      const edge = (a / (TAU / 8)) % 1;
      const w = 0.06 * (R / Math.max(r, 1));
      if (edge < w || edge > 1 - w) return 'a';
      const k = WHEEL_KEYS[seg];
      return r < 5 && k === 'K' ? 'V' : k;
    });
  });
  // bulbs chase around the rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const on = (i + frame) % 3 === 0;
    cv.set(Math.round(cx + Math.cos(a) * (R - 1) - 0.5), Math.round(cy + Math.sin(a) * (R - 1) - 0.5), on ? 'w' : 'i');
  }
  // pointer
  layer(cv, (l) => l.text(['iiiii', 'ijjji', '.iji.', '..j..'], cx - 3, cy - R - 3));
  return cv.toMap({ ...GOLD, ...WHEEL_PAL }, cv.h - groundY);
}

// ---------------------------------------------------------------- throne

function throneFrame(frame: number): PixelMap {
  const OY = 34;
  const cv = new PixelCanvas(32, 49);
  const red = (p: V3) => (hash(p[0], p[1] + p[2], 5) < 0.1 ? 'S' : 'R');
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    // backrest with a velvet panel and crest
    li.box(3, 2, 9, 13, 4, 28, 'a', (p) => (p[0] > 4.5 && p[0] < 11.5 && p[2] > 11 && p[2] < 26 ? red(p) : p[0] < 4.5 ? 'a' : 'b'), 'd');
  });
  layer(cv, (l) => {
    const [x, y] = new Iso(l, 16, OY).p(8, 3, 31);
    orb(l, x, y, 3, 3, ['a', 'b', 'c', 'd']);
    l.set(x, y - 1, 'R');
    l.set(x - 1, y - 1, 'R');
    l.set(x, y, 'S');
  });
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    // gilded seat block with a skirt band
    li.box(3, 4, 0, 13, 13, 9, 'b', (p) => (p[2] < 1.5 ? 'd' : p[2] > 7.5 ? 'a' : p[0] < 4.5 ? 'a' : 'b'), (p) => (p[2] < 1.5 ? 'e' : p[2] > 7.5 ? 'c' : 'd'));
    li.box(4.5, 5, 9, 11.5, 12.5, 11, red, 'S', 'M');
  });
  // armrests
  for (const x0 of [3, 11]) layer(cv, (l) => new Iso(l, 16, OY).box(x0, 4, 9, x0 + 2, 13, 15, 'a', 'b', 'd'));
  const iso = new Iso(cv, 16, OY);
  for (const x of [5, 8, 11]) iso.dot(x, 13, 4.5, 'w');
  shimmer(cv, frame);
  return cv.toMap({ ...GOLD, R: 0xc8102e, S: 0x8e0f24, M: 0x5e0a18 }, cv.h - (OY + 8));
}

// ---------------------------------------------------------------- felt table

function feltTableFrame(): PixelMap {
  const cv = new PixelCanvas(48, 34);
  const OY = 12;
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    li.box(4, 4, 0, 28, 12, 7, 'e', (p) => (p[2] < 1.5 ? 'f' : p[0] % 6 < 0.8 ? 'f' : 'e'), 'f');
  });
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    li.box(1, 1, 7, 31, 15, 10, (p) => {
      const inX = p[0] > 2.2 && p[0] < 29.8;
      const inY = p[1] > 2.2 && p[1] < 13.8;
      if (!inX || !inY) return p[0] < 1.8 || p[1] < 1.8 ? 'a' : 'b';
      // chalk arc and betting boxes on the felt
      const dx = (p[0] - 16) / 11;
      const dy = (p[1] - 13.8) / 8;
      const r = Math.hypot(dx, dy);
      if (Math.abs(r - 1) < 0.06) return 'P';
      if (Math.abs(p[0] - 16) < 3 && Math.abs(p[1] - 6) < 1.5) return Math.abs(p[0] - 16) > 2.4 || Math.abs(p[1] - 6) > 1 ? 'P' : 'F';
      return hash(p[0], p[1], 9) < 0.08 ? 'T' : p[1] < 4 ? 'T' : 'F';
    }, (p) => (p[2] > 9 ? 'b' : 'd'), (p) => (p[2] > 9 ? 'c' : 'e'));
  });
  // a couple of chips resting on the felt
  const iso = new Iso(cv, 16, OY);
  const [x1, y1] = iso.p(8, 9, 10);
  drum(cv, Math.round(x1), Math.round(y1) - 3, 2, 1, 1, 'R', ['R', 'M'], 'i');
  const [x2, y2] = iso.p(22, 7, 10);
  drum(cv, Math.round(x2), Math.round(y2) - 4, 2, 1, 2, 'Y', ['Y', 'd'], 'i');
  return cv.toMap({ ...GOLD, F: 0x1f7a4d, T: 0x16613c, P: 0x7fd3a4, R: 0xc8102e, M: 0x8e0f24, Y: 0xf7c948, i: 0xfffbea }, 34 - (OY + 12));
}

// ---------------------------------------------------------------- chip stack

function chipStackFrame(): PixelMap {
  const cv = new PixelCanvas(28, 30);
  const stacks: Array<[number, number, string[]]> = [
    [10, 23, ['R', 'K', 'Y', 'i', 'R', 'K', 'Y']],
    [18, 26, ['K', 'R', 'i', 'Y']],
  ];
  for (const [cx, base, cols] of stacks)
    layer(cv, (l) =>
      cols.forEach((k, i) => drum(l, cx, base - 3 - i * 2 + (i === cols.length - 1 ? 0 : 0), 5, 2.5, 1, k, [k, k, CHIP_DARK[k]], k === 'i' ? 'R' : 'i')),
    );
  // one chip lying flat in front
  layer(cv, (l) => {
    l.ellipse(7, 27, 4, 2, 'Y');
    l.set(6, 27, 'i');
    l.set(8, 27, 'i');
  });
  return cv.toMap({ ...GOLD, R: 0xc8102e, r: 0x8e0f24, K: 0x2a2446, k: 0x16132a, Y: 0xf7c948, y: 0xb88620, i: 0xfffbea, h: 0xc9b98f }, 4);
}
const CHIP_DARK: Record<string, string> = { R: 'r', K: 'k', Y: 'y', i: 'h' };

// ---------------------------------------------------------------- casino carpet

/** a 32x16 diamond that tiles seamlessly: rows 2r+1 half-wide */
export function carpetMap(): PixelMap {
  return cached('casino_carpet', () => {
    const cv = new PixelCanvas(32, 16);
    for (let y = 0; y < 16; y++) {
      const half = y < 8 ? 2 * y + 1 : 2 * (15 - y) + 1;
      for (let x = 16 - half; x < 16 + half; x++) {
        const d = Math.abs(x + 0.5 - 16) / 2 + Math.abs(y + 0.5 - 8);
        let k = 'R';
        if (d > 7.1) k = 'Y';
        else if (d > 6.3) k = 'M';
        else if (d > 3.4 && d < 4.3) k = 'Y';
        else if (d < 1.3) k = 'Y';
        else if (d < 2.3) k = 'M';
        else if ((x + y) % 4 === 0 && d > 4.3) k = 'S';
        cv.set(x, y, k);
      }
    }
    return cv.toMap({ R: 0xa3162f, S: 0xb8263d, M: 0x6e0a1e, Y: 0xd9a032 }, 8);
  });
}

// ---------------------------------------------------------------- neon sign

const GLYPHS: Record<string, string[]> = {
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};

function neonFrame(frame: number): PixelMap {
  const PW = 44;
  const PH = 17;
  const flat = new PixelCanvas(PW, PH);
  flat.rect(0, 0, PW, PH, 'o').rect(1, 1, PW - 2, PH - 2, 'K');
  // neon tube border
  for (let x = 2; x < PW - 2; x++) {
    flat.set(x, 2, 'P');
    flat.set(x, PH - 3, 'P');
  }
  for (let y = 2; y < PH - 2; y++) {
    flat.set(2, y, 'P');
    flat.set(PW - 3, y, 'P');
  }
  // letters with a soft red halo
  let x = 5;
  const letters = new PixelCanvas(PW, PH);
  for (const ch of 'CASINO') {
    const g = GLYPHS[ch];
    g.forEach((row, gy) => [...row].forEach((c, gx) => c === '#' && letters.set(x + gx, 5 + gy, gy < 2 ? 'i' : 'N')));
    x += g[0].length + 2;
  }
  const halo = letters.clone().outline('H');
  flat.stamp(halo).stamp(letters);
  // bulbs chasing along the top and bottom rails
  for (let bx = 1; bx < PW - 1; bx += 3) {
    const on = Math.floor(bx / 3) % 4 === frame % 4;
    flat.set(bx, 0, on ? 'i' : 'Y');
    flat.set(PW - 1 - bx, PH - 1, on ? 'i' : 'Y');
  }
  // shear onto the wall's 2:1 slope
  const cv = new PixelCanvas(PW, PH + PW / 2);
  for (let yy = 0; yy < PH; yy++) for (let xx = 0; xx < PW; xx++) cv.set(xx, yy + Math.floor(xx / 2), flat.get(xx, yy));
  return cv.toMap({ o: 0x1a0d10, K: 0x1b1838, P: 0xff3b5c, N: 0xff6f86, i: 0xfff4f0, H: 0x7a1030, Y: 0xd9a032 });
}

// ---------------------------------------------------------------- slot machine

const REEL = ['R', 'Y', 'K', 'G', 'Y', 'R'];

function slotFrame(frame: number, on: boolean): PixelMap {
  const OY = 32;
  const cv = new PixelCanvas(32, 46);
  layer(cv, (l) => {
    const li = new Iso(l, 16, OY);
    li.box(3, 4, 0, 13, 12, 22, (p) => (p[0] < 4 || p[1] < 5 ? 'a' : 'b'), (p) => {
      if (p[2] < 2) return 'd';
      if (p[2] > 19.5) return 'b';
      // reel window
      if (p[2] > 11 && p[2] < 19 && p[0] > 4.5 && p[0] < 11.5) {
        if (p[2] < 11.9 || p[2] > 18.1 || p[0] < 5.2 || p[0] > 10.8) return 'b';
        const reel = Math.floor((p[0] - 5.2) / 1.87);
        if ((p[0] - 5.2) % 1.87 < 0.35) return 'j';
        const scroll = on ? frame * (reel + 1) * 0.9 : 0;
        const row = Math.floor((p[2] + scroll) / 3);
        const inner = (p[2] + scroll) % 3;
        return inner > 0.6 && inner < 2.4 && Math.abs(p[2] - 15) < 2.6 ? REEL[(row + reel * 2) % REEL.length] : 'i';
      }
      if (p[2] > 5 && p[2] < 8 && p[0] > 5 && p[0] < 11) return p[2] > 7 ? 'e' : 'f';
      return p[0] < 4.5 ? 'S' : 'C';
    }, (p) => (p[2] < 2 ? 'e' : p[2] > 19.5 ? 'c' : p[1] > 10.5 ? 'M' : 'D'));
  });
  // crown light on top
  layer(cv, (l) => {
    const [x, y] = new Iso(l, 16, OY).p(8, 8, 25);
    orb(l, x, y, 3, 2, on && frame % 2 ? ['w', 'a', 'b'] : ['a', 'b', 'c', 'd']);
  });
  // lever on the right side
  layer(cv, (l) => {
    const [x0, y0] = new Iso(l, 16, OY).p(13, 8, 12);
    const pull = on ? [0, 0, 1, 3, 1, 0, 0, 0][frame % 8] : 0;
    l.rect(x0 + 1, y0 - 9 + pull, 1, 9 - pull, 'c').rect(x0 + 2, y0 - 9 + pull, 1, 9 - pull, 'd');
    orb(l, x0 + 1.5, y0 - 10 + pull, 2, 2, ['X', 'R', 'M']);
  });
  const iso = new Iso(cv, 16, OY);
  for (let i = 0; i < 4; i++) iso.dot(4.5 + i * 2, 12, 20.5, on && (i + frame) % 2 ? 'w' : 'Y');
  return cv.toMap({ ...GOLD, C: 0xc8102e, S: 0xe23a52, D: 0x8e0f24, M: 0x5e0a18, R: 0xe0203c, X: 0xff8a9a, Y: 0xf7c948, K: 0x2a2446, G: 0x22915a, i: 0xfffbea, j: 0xc9b98f }, cv.h - (OY + 8));
}

// ---------------------------------------------------------------- velvet rope

function ropeFrame(): PixelMap {
  const cv = new PixelCanvas(36, 36);
  const px = 9;
  const gy = 32;
  // rope sagging off toward the next post
  layer(cv, (l) => {
    for (let x = px + 1; x < 36; x++) {
      const t = (x - px) / (36 - px);
      const y = Math.round(gy - 25 + t * 12 + Math.sin(t * Math.PI) * 5);
      l.set(x, y, 'S');
      l.set(x, y + 1, 'R');
      l.set(x, y + 2, 'M');
    }
  });
  layer(cv, (l) => {
    drum(l, px, gy - 4, 5, 2.5, 2, 'a', ['b', 'c', 'd', 'e']);
    l.rect(px - 1, gy - 26, 3, 24, 'c').rect(px - 1, gy - 26, 1, 24, 'a').rect(px + 1, gy - 26, 1, 24, 'd');
    orb(l, px + 0.5, gy - 28, 2.8, 2.8, ['a', 'b', 'c', 'd']);
  });
  return cv.toMap({ ...GOLD, S: 0xe23a52, R: 0xc8102e, M: 0x6e0a1e }, 36 - gy, px + 0.5);
}

// ---------------------------------------------------------------- registry

export interface CasinoPaintCtx {
  kind: string;
  state: string;
  frame: number;
  on: boolean;
}

/** the pixel map for a casino kind in a given state/frame, or null for unknown kinds */
export function casinoMap(c: CasinoPaintCtx): PixelMap | null {
  const f8 = c.frame % 8;
  switch (c.kind) {
    case 'dicemaster':
      return dicemasterMap(c.state, c.frame);
    case 'holodice': {
      const k = holoKey(c.state);
      const f = k === '-1' ? f8 : /^\d+$/.test(k) && k !== '0' ? c.frame % HOLO_IDLE_FRAMES : 0;
      return cached(`holodice:${k}:${f}`, () => holodiceFrame(k, f));
    }
    case 'wheel_fortune': {
      const k = c.state === '-1' || /^[1-8]$/.test(c.state) ? c.state : '0';
      const f = k === '-1' ? c.frame % 12 : 0;
      return cached(`wheel:${k}:${f}`, () => wheelFrame(k, f));
    }
    case 'throne':
      return cached(`throne:${f8}`, () => throneFrame(f8));
    case 'felt_table':
      return cached('felt_table', feltTableFrame);
    case 'chip_stack':
      return cached('chip_stack', chipStackFrame);
    case 'casino_carpet':
      return carpetMap();
    case 'neon_casino':
      return cached(`neon:${f8}`, () => neonFrame(f8));
    case 'slot_prop':
      return cached(`slot:${c.on ? 1 : 0}:${c.on ? f8 : 0}`, () => slotFrame(f8, c.on));
    case 'velvet_rope_gold':
      return cached('rope', ropeFrame);
    default:
      return tradingMap(c);
  }
}

/** every frame this module can draw, for tests and previews */
export function allCasinoFrames(): Array<{ name: string; map: PixelMap }> {
  const out: Array<{ name: string; map: PixelMap }> = [];
  const add = (kind: string, state: string, frames: number, on = true) => {
    for (let frame = 0; frame < frames; frame++) out.push({ name: `${kind}:${state}:${on ? 'on' : 'off'}:${frame}`, map: casinoMap({ kind, state, frame, on })! });
  };
  for (const k of ['0', '1', '2', '3', '4', '5', '6', ...LID_OPEN, ...LID_CLOSE]) add('dicemaster', k, 1);
  add('dicemaster', '-1', 8);
  add('holodice', '0', 1);
  for (const n of ['7', '42', '100']) {
    for (const l of HOLO_LOCK) add('holodice', `${l}:${n}`, 1);
    add('holodice', n, HOLO_IDLE_FRAMES);
  }
  add('holodice', '-1', 8);
  for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8']) add('wheel_fortune', k, 1);
  add('wheel_fortune', '-1', 12);
  add('throne', '', 8);
  add('felt_table', '', 1);
  add('chip_stack', '', 1);
  add('casino_carpet', '', 1);
  add('neon_casino', '', 8);
  add('slot_prop', '', 8);
  add('slot_prop', '', 1, false);
  add('velvet_rope_gold', '', 1);
  out.push(...allTradingFrames());
  return out;
}

// ---------------------------------------------------------------- lid tween

/** client-only lid swing between two dicemaster states, or null when none plays */
export function lidSequence(from: string, to: string): readonly string[] | null {
  const face = (s: string) => /^[1-6]$/.test(s);
  if (from === '-1' && face(to)) return LID_OPEN;
  // closing, or rolling again straight from a shown face: swing shut first
  if (face(from) && (to === '0' || to === '' || to === '-1')) return LID_CLOSE;
  return null;
}
