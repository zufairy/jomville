/**
 * Avatar art pack loader.
 *
 * Parts are real sprite sheets under /lpc (built by scripts/fetch-lpc.mjs from
 * the Universal LPC Spritesheet collection, CC-BY-SA 3.0 / GPL 3.0 — see
 * client/public/lpc/CREDITS.md). Each sheet is cropped to the walk block:
 * 9 columns x 4 rows of 64px frames, rows ordered up, left, down, right,
 * column 0 being the standing pose.
 *
 * A look is composited by stacking the chosen part sheets in z order onto one
 * canvas, which becomes a single GPU texture. Sheets are cached by URL and
 * composites by config, so a room of 50 avatars uploads one texture per look.
 */
import { CanvasSource, Rectangle, Texture } from 'pixi.js';

export const FRAME = 64;
export const COLS = 9;
export const ROWS = 4;
export const WALK_FRAMES = 8; // columns 1..8; column 0 is the standing pose

export interface PartDef {
  id: string;
  slot: string;
  name: string;
  z: number;
  base: boolean;
  rarity: string;
  variants: string[];
  /** "<sex>/<variant>" -> path relative to /lpc */
  files: Record<string, string>;
}

export interface Manifest {
  frame: number;
  cols: number;
  rows: number;
  dirs: string[];
  parts: PartDef[];
}

const BASE = '/lpc';

let manifestPromise: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE}/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      })
      .catch((e) => {
        console.error('[lpc] manifest failed', e);
        manifestPromise = null;
        throw e;
      });
  }
  return manifestPromise;
}

/** Manifest, once loaded. Null until then; used by UI that must render synchronously. */
export let manifest: Manifest | null = null;
void loadManifest()
  .then((m) => (manifest = m))
  .catch(() => {});

export function partsBySlot(m: Manifest, slot: string): PartDef[] {
  return m.parts.filter((p) => p.slot === slot);
}

export function findPart(m: Manifest, id: string): PartDef | undefined {
  return m.parts.find((p) => p.id === id);
}

/**
 * Resolve a part+variant to a sheet path. Upstream files some parts per body
 * type and others once for everyone, so try the exact body first, then the
 * shared buckets, then the other body, then any bucket that has this colour.
 */
export function sheetFor(part: PartDef, sex: string, variant: string): string | null {
  const order = [sex, 'unisex', 'adult', 'universal', sex === 'male' ? 'female' : 'male'];
  for (const bucket of order) {
    const hit = part.files[`${bucket}/${variant}`];
    if (hit) return hit;
  }
  const any = Object.keys(part.files).find((k) => k.endsWith(`/${variant}`));
  return any ? part.files[any] : null;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(rel: string): Promise<HTMLImageElement | null> {
  let p = images.get(rel);
  if (!p) {
    p = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn('[lpc] missing sheet', rel);
        resolve(null);
      };
      img.src = `${BASE}/${rel}`;
    });
    images.set(rel, p);
  }
  return p;
}

export interface Layer {
  rel: string;
  z: number;
}

export interface Composite {
  key: string;
  canvas: HTMLCanvasElement;
  /** frames[row][col]; rows are up, left, down, right */
  frames: Texture[][];
}

const composites = new Map<string, Composite>();
const pending = new Map<string, Promise<Composite>>();

export function cachedComposite(key: string): Composite | undefined {
  return composites.get(key);
}

/** Stack the given sheets into one texture set. Layers are drawn low z first. */
export async function composite(key: string, layers: Layer[]): Promise<Composite> {
  const hit = composites.get(key);
  if (hit) return hit;
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const job = (async () => {
    const sorted = [...layers].sort((a, b) => a.z - b.z);
    const imgs = await Promise.all(sorted.map((l) => loadImage(l.rel)));
    const canvas = document.createElement('canvas');
    canvas.width = COLS * FRAME;
    canvas.height = ROWS * FRAME;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (const img of imgs) {
      if (!img) continue;
      ctx.drawImage(img, 0, 0);
    }
    const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest', autoGenerateMipmaps: false });
    const frames: Texture[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: Texture[] = [];
      for (let c = 0; c < COLS; c++) {
        row.push(new Texture({ source, frame: new Rectangle(c * FRAME, r * FRAME, FRAME, FRAME) }));
      }
      frames.push(row);
    }
    const made: Composite = { key, canvas, frames };
    composites.set(key, made);
    pending.delete(key);
    return made;
  })();

  pending.set(key, job);
  return job;
}

/** Game dir (0 up, 1 right, 2 down, 3 left) -> sheet row (0 up, 1 left, 2 down, 3 right). */
export function dirRow(dir: number): number {
  return [0, 3, 2, 1][dir] ?? 2;
}
