import { Container, Graphics, Sprite } from 'pixi.js';
import { RoomStyle, TILE_H, TILE_W, footprint, furnitureDef, maskAllows, tileToScreen } from '@dovey/shared';
import { RoomPreview, fetchRoomPreview } from '../api';
import { atlas } from './atlas';
import { WALL_HEIGHT } from './walls';

/**
 * Room browser thumbnails: a small picture of the real room (floor, walls and
 * its furniture from the atlas), drawn with the game's renderer and cached as
 * a JPEG data URL. Plain fills only; gradients leak GPU textures.
 */
const OUT_W = 480;
const OUT_H = 270;
const TTL_MS = 60_000;
const WALL_H = WALL_HEIGHT;
const INK = 0x3b2a2a;

const cache = new Map<string, { at: number; url: Promise<string | null> }>();

export function roomThumb(slug: string): Promise<string | null> {
  const hit = cache.get(slug);
  if (hit && performance.now() - hit.at < TTL_MS) return hit.url;
  const url = fetchRoomPreview(slug)
    .then((p) => (p ? schedule(slug, p) : null))
    .catch(() => null);
  cache.set(slug, { at: performance.now(), url });
  void url.then((u) => {
    if (!u) cache.delete(slug);
  });
  return url;
}

/**
 * Paint jobs run one per macrotask so the game keeps rendering between them.
 * Newest request first: switching tabs puts the cards now on screen ahead of
 * the ones just scrolled away from. A timer, not rAF, so hidden tabs still finish.
 */
const pending: Array<{ slug: string; preview: RoomPreview; resolve: (url: string | null) => void }> = [];
let pumping = false;

function schedule(slug: string, preview: RoomPreview): Promise<string | null> {
  return new Promise((resolve) => {
    pending.push({ slug, preview, resolve });
    if (!pumping) {
      pumping = true;
      setTimeout(pump, 0);
    }
  });
}

function runJob(job: (typeof pending)[number]): number {
  const t0 = performance.now();
  try {
    job.resolve(atlas.ready ? paint(job.preview) : null);
  } catch (e) {
    console.error('[thumb] paint failed', job.slug, e);
    job.resolve(null);
  }
  return Math.round(performance.now() - t0);
}

function pump() {
  const job = pending.pop();
  if (!job) {
    pumping = false;
    return;
  }
  const ms = runJob(job);
  if (import.meta.env.DEV) console.debug('[thumb]', job.slug, `${ms}ms`);
  setTimeout(pump, 0);
}

// dev inspection: background test tabs throttle timers, so let a test drain the queue directly
if (import.meta.env.DEV) {
  (window as unknown as { __thumbs: unknown }).__thumbs = {
    request: roomThumb,
    queued: () => pending.length,
    pumping: () => pumping,
    drain: () => {
      const timings: Record<string, number> = {};
      for (let job = pending.pop(); job; job = pending.pop()) timings[job.slug] = runJob(job);
      return timings;
    },
  };
}

interface Look {
  tiles: [number, number];
  wall: number | null;
  bg: number;
  water: number | null;
}

const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** Mirrors the room's in-game palette closely enough to recognise it at card size. */
function lookFor(theme: string, style: RoomStyle): Look {
  switch (theme) {
    case 'park':
      return { tiles: [0xa6d977, 0x9bd06c], wall: null, bg: style.bg, water: null };
    case 'beach':
      return { tiles: [0xf7dcaa, 0xf2d29a], wall: null, bg: 0xf6a36b, water: 0x58a8d8 };
    case 'harbor':
      return { tiles: [0xf1dfb4, 0xebd5a4], wall: null, bg: style.bg, water: 0x6cc4e8 };
    case 'love':
      return { tiles: [0xffe3ea, 0xffd3df], wall: style.walls ? 0xffb3c6 : null, bg: style.bg, water: null };
    case 'dream':
      return { tiles: [0xfff3f8, 0xffdcea], wall: style.walls ? 0xffc2da : null, bg: 0xffe1ef, water: null };
    case 'lab':
      return { tiles: [0x2c3350, shade(0x2c3350, 0.94)], wall: style.walls ? 0x2b2458 : null, bg: 0x0b0a1e, water: null };
    case 'funpark':
      return { tiles: [0x7d4e31, 0x74482c], wall: style.walls ? 0x7a4a2f : null, bg: 0x1a110c, water: null };
    case 'gameroom':
      return { tiles: [0x2b2f4a, 0x252841], wall: style.walls ? 0x33295e : null, bg: 0x120f24, water: null };
    default:
      return { tiles: [style.floor, shade(style.floor, 0.94)], wall: style.walls ? style.wall : null, bg: style.bg, water: null };
  }
}

function paint(p: RoomPreview): string | null {
  const look = lookFor(p.theme, p.style);
  const S = p.size;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && maskAllows(p.mask, x, y);
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);

  if (look.water !== null) {
    const m = 3;
    const c = [tileToScreen(-m, -m), tileToScreen(S + m, -m), tileToScreen(S + m, S + m), tileToScreen(-m, S + m)];
    g.poly(c).fill(look.water);
  }

  if (look.wall !== null) {
    const left = shade(look.wall, 0.86);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!at(x, y)) continue;
        const a = tileToScreen(x, y);
        if (!at(x, y - 1)) {
          const b = tileToScreen(x + 1, y);
          g.poly([a.x, a.y - WALL_H, b.x, b.y - WALL_H, b.x, b.y, a.x, a.y]).fill(look.wall);
        }
        if (!at(x - 1, y)) {
          const d = tileToScreen(x, y + 1);
          g.poly([a.x, a.y - WALL_H, d.x, d.y - WALL_H, d.x, d.y, a.x, a.y]).fill(left);
        }
      }
  }

  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!at(x, y)) continue;
      const q = tileToScreen(x, y);
      g.poly([q.x, q.y, q.x + TILE_W / 2, q.y + TILE_H / 2, q.x, q.y + TILE_H, q.x - TILE_W / 2, q.y + TILE_H / 2]).fill(look.tiles[(x + y) % 2]);
    }
  // the room's outer edge, so the floor reads as a shape at small sizes
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!at(x, y)) continue;
      const p0 = tileToScreen(x, y);
      const p1 = tileToScreen(x + 1, y);
      const p2 = tileToScreen(x + 1, y + 1);
      const p3 = tileToScreen(x, y + 1);
      if (!at(x + 1, y)) g.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ width: 4, color: INK });
      if (!at(x, y + 1)) g.moveTo(p2.x, p2.y).lineTo(p3.x, p3.y).stroke({ width: 4, color: INK });
      if (!at(x, y - 1) && look.wall === null) g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 4, color: INK });
      if (!at(x - 1, y) && look.wall === null) g.moveTo(p3.x, p3.y).lineTo(p0.x, p0.y).stroke({ width: 4, color: INK });
    }

  const items = new Container();
  items.sortableChildren = true;
  for (const pl of p.layout) {
    const d = furnitureDef(pl.def);
    if (!d) continue;
    const set = atlas.frames(d, pl.rot, pl.on ?? true);
    const s = new Sprite(set.textures[0]);
    const o = tileToScreen(pl.x, pl.y);
    s.position.set(o.x + set.offsetX, o.y + set.offsetY);
    const { w, h } = footprint(d, pl.rot);
    s.zIndex = d.walkable ? -1000 + pl.x + pl.y : pl.x + w + pl.y + h - 1.5;
    items.addChild(s);
  }
  root.addChild(items);

  const b = root.getLocalBounds();
  const res = Math.min(OUT_W / b.width, OUT_H / b.height) * 0.94;
  const src = atlas.snapshot(root, res);
  // sprites share atlas textures, which must outlive this snapshot
  root.destroy({ children: true });
  if (!src) return null;

  const out = document.createElement('canvas');
  out.width = OUT_W;
  out.height = OUT_H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = `#${look.bg.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, OUT_W, OUT_H);
  ctx.drawImage(src, Math.round((OUT_W - src.width) / 2), Math.round((OUT_H - src.height) / 2));
  return out.toDataURL('image/jpeg', 0.85);
}
