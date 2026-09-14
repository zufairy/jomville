import { Graphics } from 'pixi.js';
import { FurnitureDef, ROLLING, tileToScreen } from '@dovey/shared';
import type { ArtCtx } from './furnitureArt';
import { box, shade } from './furnitureArt';
import { cylinder, glow, shadow } from './parkArt';

/**
 * Casino furniture: red felt, gold trim, glowing dice. Chance furni read
 * `c.state` (see artStateKey): '0' closed, '-1' rolling (animated), else a face.
 */

type Painter = (g: Graphics, c: ArtCtx) => void;
type Pt = { x: number; y: number };

const TAU = Math.PI * 2;
const RED = 0xc8102e;
const DARK_RED = 0x6e0a1e;
const GOLD = 0xf2b632;
const GOLD_DARK = 0xa8741a;
const IVORY = 0xfffdf6;
const INK = 0x1b1838;
const FELT = 0x1f7a4d;
const WOOD = 0x5b3a1e;
const WHEEL = [0xc8102e, 0x1b1838, 0xf2b632, 0x1f7a4d, 0xc8102e, 0x1b1838, 0x5ef2ff, 0xc49bff];

const lift = (tx: number, ty: number, z: number): Pt => {
  const p = tileToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
};

export function artStateKey(def: FurnitureDef, state: string | undefined): string {
  if (!def.interaction) return '';
  const s = state || '0';
  if (def.interaction !== 'dice100' || s === ROLLING || s === '0') return s;
  const n = Number(s);
  return n <= 33 ? 'lo' : n <= 66 ? 'mid' : 'hi';
}

/** pip positions on a unit face, centre (0,0), span -1..1 */
const PIPS: Record<string, Array<[number, number]>> = {
  '1': [[0, 0]],
  '2': [[-0.5, -0.5], [0.5, 0.5]],
  '3': [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
  '4': [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  '5': [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]],
  '6': [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0], [0.5, 0], [-0.5, 0.6], [0.5, 0.6]],
};

/** draws the cube; returns the hop height so faces can be drawn on top */
function dieCube(g: Graphics, c: ArtCtx, body: number, sideCol: number): number {
  const rolling = c.state === ROLLING;
  const hop = rolling ? Math.abs(Math.sin(c.t * TAU * 2)) * 8 : 0;
  shadow(g, c.cx, c.cy + 2, 14 - hop / 2, 6, 0.25);
  box(g, 0.2, 0.2, 0.6, 0.6, 2 + hop, 22, body, sideCol);
  if (rolling) {
    const top = lift(0.5, 0.5, 26 + hop);
    for (let i = 0; i < 3; i++) {
      const a = c.t * TAU + (i * TAU) / 3;
      g.moveTo(top.x + Math.cos(a) * 6, top.y + Math.sin(a) * 3).lineTo(top.x + Math.cos(a) * 14, top.y + Math.sin(a) * 7);
    }
    g.stroke({ width: 1.5, color: GOLD, alpha: 0.8 });
  }
  return hop;
}

export const CASINO_PAINTERS: Record<string, Painter> = {
  dicemaster(g, c) {
    const hop = dieCube(g, c, IVORY, 0xe6e0f2);
    const top = lift(0.5, 0.5, 26 + hop);
    if (c.state === '0') {
      g.ellipse(top.x, top.y, 11, 5.5).fill(GOLD).stroke({ width: 1, color: GOLD_DARK });
      return;
    }
    const pips = PIPS[c.state];
    if (!pips) return;
    for (const [u, v] of pips) g.ellipse(top.x + (u - v) * 7, top.y + (u + v) * 3.5, 2.2, 1.2).fill(c.state === '1' ? RED : INK);
  },

  holodice(g, c) {
    const colour = c.state === 'lo' ? 0x5ef2ff : c.state === 'mid' ? 0xc49bff : c.state === 'hi' ? GOLD : 0x7d7a91;
    const hop = dieCube(g, c, shade(colour, 0.9), shade(colour, 0.6));
    const top = lift(0.5, 0.5, 26 + hop);
    glow(g, top.x, top.y - 4, 16, colour, c.state === '0' ? 0.15 : 0.45);
    g.ellipse(top.x, top.y, 7, 3.5).fill({ color: IVORY, alpha: 0.9 });
  },

  wheel_fortune(g, c) {
    const base = lift(c.w / 2, c.h / 2, 0);
    shadow(g, base.x, base.y + 2, 26, 10, 0.25);
    box(g, 0.1, 0.25, c.w - 0.2, 0.5, 0, 14, DARK_RED, shade(DARK_RED, 0.7));
    const hub = { x: base.x, y: base.y - 56 };
    const R = 34;
    const result = Number(c.state);
    // rolling spins with the frame; a result parks that segment under the top pointer
    const rot = c.state === ROLLING ? -c.t * TAU : result >= 1 ? -((result - 1) / 8) * TAU - TAU / 16 : 0;
    for (let i = 0; i < 8; i++) {
      const a0 = rot + (i / 8) * TAU - Math.PI / 2;
      g.moveTo(hub.x, hub.y).arc(hub.x, hub.y, R, a0, a0 + TAU / 8).lineTo(hub.x, hub.y).fill(WHEEL[i]);
    }
    g.circle(hub.x, hub.y, R).stroke({ width: 3, color: GOLD });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      g.circle(hub.x + Math.cos(a) * (R + 3), hub.y + Math.sin(a) * (R + 3), 1.6).fill(c.frame % 2 === i % 2 ? IVORY : GOLD);
    }
    g.circle(hub.x, hub.y, 5).fill(GOLD);
    g.poly([hub.x - 5, hub.y - R - 8, hub.x + 5, hub.y - R - 8, hub.x, hub.y - R + 4]).fill(IVORY).stroke({ width: 1, color: INK });
  },

  dragon_egg(g, c) {
    const pulse = 0.35 + Math.sin(c.t * TAU) * 0.15;
    shadow(g, c.cx, c.cy + 2, 12, 5, 0.25);
    cylinder(g, c.cx, c.cy, 12, 5, 4, GOLD, GOLD_DARK);
    glow(g, c.cx, c.cy - 20, 20, 0x7cf29a, pulse);
    g.ellipse(c.cx, c.cy - 20, 10, 15).fill(0x2f8f5b).stroke({ width: 1.5, color: INK });
    for (const [dx, dy] of [[-4, -26], [3, -18], [-2, -11], [5, -28]] as const) g.ellipse(c.cx + dx, c.cy + dy, 2.4, 1.6).fill(0x7cf29a);
  },

  throne(g, c) {
    const shine = 0.3 + Math.sin(c.t * TAU) * 0.2;
    shadow(g, c.cx, c.cy + 2, 16, 7, 0.28);
    box(g, 0.15, 0.15, 0.7, 0.7, 0, 16, GOLD, GOLD_DARK);
    box(g, 0.12, 0.08, 0.76, 0.14, 16, c.def.tall - 16, GOLD, GOLD_DARK);
    box(g, 0.25, 0.25, 0.5, 0.5, 16, 3, RED, DARK_RED, false);
    const crest = lift(0.5, 0.15, c.def.tall + 4);
    g.circle(crest.x, crest.y, 5).fill(RED).stroke({ width: 1.5, color: GOLD_DARK });
    glow(g, crest.x, crest.y, 12, GOLD, shine);
  },

  felt_table(g, c) {
    shadow(g, c.cx, c.cy + 2, 26, 10, 0.22);
    box(g, 0.08, 0.1, c.w - 0.16, c.h - 0.2, 0, c.def.tall, FELT, WOOD);
    const T = c.def.tall;
    g.poly([lift(0.08, 0.1, T), lift(c.w - 0.08, 0.1, T), lift(c.w - 0.08, c.h - 0.1, T), lift(0.08, c.h - 0.1, T)]).stroke({ width: 2, color: GOLD });
  },

  chip_stack(g, c) {
    shadow(g, c.cx, c.cy + 2, 12, 5, 0.22);
    const cols = [RED, INK, GOLD, IVORY, RED, INK];
    cols.forEach((col, i) => cylinder(g, c.cx - 4, c.cy - i * 3, 6, 3, 3, col, shade(col, 0.7)));
    cols.slice(0, 4).forEach((col, i) => cylinder(g, c.cx + 5, c.cy + 2 - i * 3, 6, 3, 3, col, shade(col, 0.7)));
  },

  casino_carpet(g) {
    g.poly([lift(0, 0, 0), lift(1, 0, 0), lift(1, 1, 0), lift(0, 1, 0)]).fill(DARK_RED);
    g.poly([lift(0.5, 0.15, 0), lift(0.85, 0.5, 0), lift(0.5, 0.85, 0), lift(0.15, 0.5, 0)]).stroke({ width: 1, color: GOLD, alpha: 0.6 });
  },

  neon_casino(g, c) {
    // wall sign: dark panel, red neon frame, bulbs chasing along it
    const onX = c.rot % 2 === 0;
    const a = lift(0, 0, 70);
    const b = onX ? lift(c.w, 0, 70) : lift(0, c.h, 70);
    g.poly([a, b, { x: b.x, y: b.y - 24 }, { x: a.x, y: a.y - 24 }]).fill(INK).stroke({ width: 3, color: RED });
    glow(g, (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, 40, RED, 0.35);
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8;
      g.circle(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - 12, 3).fill(i % 4 === c.frame % 4 ? IVORY : GOLD);
    }
  },

  slot_prop(g, c) {
    shadow(g, c.cx, c.cy + 2, 14, 6, 0.25);
    box(g, 0.15, 0.2, 0.7, 0.6, 0, c.def.tall, RED, DARK_RED);
    const win = lift(0.5, 0.8, 38);
    g.rect(win.x - 10, win.y - 6, 20, 10).fill(IVORY).stroke({ width: 1, color: GOLD_DARK });
    for (let i = 0; i < 3; i++) g.circle(win.x - 6 + i * 6, win.y - 1, 2).fill(WHEEL[(i + c.frame) % WHEEL.length]);
    glow(g, win.x, win.y - 20, 14, GOLD, c.on ? 0.4 : 0.1);
  },

  velvet_rope_gold(g, c) {
    shadow(g, c.cx, c.cy + 2, 8, 4, 0.2);
    cylinder(g, c.cx, c.cy, 6, 3, 3, GOLD, GOLD_DARK);
    box(g, 0.45, 0.45, 0.1, 0.1, 3, 28, GOLD, GOLD_DARK, false);
    const top = lift(0.5, 0.5, 32);
    g.circle(top.x, top.y, 3).fill(GOLD);
    g.moveTo(top.x, top.y + 2).quadraticCurveTo(top.x + 14, top.y + 14, top.x + 30, top.y + 6).stroke({ width: 3, color: RED });
  },
};
