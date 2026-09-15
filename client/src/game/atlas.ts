import { CanvasSource, Container, DOMAdapter, Graphics, Rectangle, Renderer, Texture, TextureSource } from 'pixi.js';
import { FurnitureDef, furnitureDef } from '@dovey/shared';
import { artBounds, paintFurniture } from './furnitureArt';
import { artFps, artFrameCount, artStateKey } from './casinoArt';
import { HOLO_LOCK } from './casinoPixels';

/**
 * Runtime sprite sheet for furniture. Every (item, rotation, on/off) is baked
 * once from vector art into a strip of HD textures (one per animation frame)
 * at 2x resolution, then reused by every sprite in the room. Lazy: a variant
 * is rendered the first time it is asked for.
 */
export interface FrameSet {
  textures: Texture[];
  /** where the texture's top-left sits relative to the item's tile origin */
  offsetX: number;
  offsetY: number;
  /** playback speed override (frames per second), null for the item's usual loop speed */
  fps: number | null;
}

export const ATLAS_RES = 2;

/** builds one GPU source from RGBA pixels (w x h device px); swappable for tests */
export type StripSource = (w: number, h: number, pixels: Uint8ClampedArray<ArrayBuffer>) => TextureSource;

const canvasStrip: StripSource = (w, h, pixels) => {
  const canvas = DOMAdapter.get().createCanvas(w, h);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
  return new CanvasSource({ resource: canvas as HTMLCanvasElement, resolution: ATLAS_RES, scaleMode: 'nearest', autoGenerateMipmaps: false });
};

/**
 * A Graphics stand-in that rasterises pixel-art rects (whole px, opaque) at
 * ATLAS_RES into one cell of an RGBA strip. `bounds` is the cell's art bounds
 * (world px, tile origin); `cellX` its left edge in the strip (device px).
 */
function rectRaster(pixels: Uint8ClampedArray, stripW: number, cellX: number, bounds: { x: number; y: number; w: number; h: number }) {
  const minX = bounds.x * ATLAS_RES;
  const minY = bounds.y * ATLAS_RES;
  const maxX = minX + bounds.w * ATLAS_RES;
  const maxY = minY + bounds.h * ATLAS_RES;
  let r: number[] = [];
  const g = {
    rect(...a: number[]) {
      r = a;
      return g;
    },
    fill(colour: number) {
      const [x, y, w, h] = r.map((v) => v * ATLAS_RES);
      const cr = (colour >> 16) & 255;
      const cg = (colour >> 8) & 255;
      const cb = colour & 255;
      for (let j = Math.max(minY, y); j < Math.min(maxY, y + h); j++)
        for (let i = Math.max(minX, x); i < Math.min(maxX, x + w); i++) {
          const k = ((j - minY) * stripW + cellX + i - minX) * 4;
          pixels[k] = cr;
          pixels[k + 1] = cg;
          pixels[k + 2] = cb;
          pixels[k + 3] = 255;
        }
      return g;
    },
  };
  return g;
}

class FurnitureAtlas {
  private renderer: Renderer | null = null;
  private cache = new Map<string, FrameSet>();
  private previews = new Map<string, string>();
  /** how holodice number strips reach the GPU (tests count and inspect these) */
  stripSource: StripSource = canvasStrip;

  bind(renderer: Renderer) {
    this.renderer = renderer;
  }

  get ready() {
    return !!this.renderer;
  }

  frames(def: FurnitureDef, rot: number, on: boolean, state = ''): FrameSet {
    const sk = artStateKey(def, state);
    const key = `${def.id}:${rot}:${on ? 1 : 0}:${sk}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.renderer) throw new Error('atlas not bound');
    const n = def.interaction === 'dice100' ? /^(?:lock[123]:)?(\d+)$/.exec(sk)?.[1] : undefined;
    if (n && n !== '0') {
      this.bakeHoloNumber(def, rot, on, n);
      return this.cache.get(key)!;
    }
    const b = artBounds(def, rot);
    const frame = new Rectangle(b.x, b.y, b.w, b.h);
    const textures: Texture[] = [];
    // a shown face is a still (the holodice loops a short idle); rolling animates
    const count = artFrameCount(def, sk);
    for (let f = 0; f < count; f++) {
      const g = new Graphics();
      paintFurniture(g, def, rot, f, on, sk);
      const tex = this.renderer.generateTexture({ target: g, frame, resolution: ATLAS_RES });
      textures.push(tex);
      g.destroy();
    }
    const set: FrameSet = { textures, offsetX: b.x, offsetY: b.y, fps: artFps(def, sk) };
    this.cache.set(key, set);
    return set;
  }

  /**
   * A holodice number shows up at once as its lock-in pop and then its idle
   * loop: seven pixel-art frames. Rasterising them on the CPU into one strip
   * costs a single texture upload instead of seven Graphics bakes and render
   * passes in the middle of the reveal. The rects are whole device pixels, so
   * the strip matches what generateTexture drew pixel for pixel.
   */
  private bakeHoloNumber(def: FurnitureDef, rot: number, on: boolean, n: string) {
    const b = artBounds(def, rot);
    const W = b.w * ATLAS_RES;
    const H = b.h * ATLAS_RES;
    const idle = Array.from({ length: artFrameCount(def, n) }, (_, f) => [n, f] as const);
    const frames: Array<readonly [string, number]> = [...idle, ...HOLO_LOCK.map((l) => [`${l}:${n}`, 0] as const)];
    const pixels = new Uint8ClampedArray(W * frames.length * H * 4);
    frames.forEach(([sk, f], i) => {
      // the holodice painter only draws whole-pixel rects (drawPixelMap), which rectRaster reproduces exactly
      paintFurniture(rectRaster(pixels, W * frames.length, i * W, b) as unknown as Graphics, def, rot, f, on, sk);
    });
    const source = this.stripSource(W * frames.length, H, pixels);
    const tex = (i: number) => new Texture({ source, frame: new Rectangle(i * b.w, 0, b.w, b.h) });
    const put = (sk: string, textures: Texture[]) =>
      this.cache.set(`${def.id}:${rot}:${on ? 1 : 0}:${sk}`, { textures, offsetX: b.x, offsetY: b.y, fps: artFps(def, sk) });
    put(n, idle.map((_, i) => tex(i)));
    HOLO_LOCK.forEach((l, j) => put(`${l}:${n}`, [tex(idle.length + j)]));
  }

  /** PNG data URL of the item at rotation 0, frame 0, switched on — for the shop and build tray. */
  preview(defId: string): string {
    const hit = this.previews.get(defId);
    if (hit) return hit;
    const def = furnitureDef(defId);
    if (!def || !this.renderer) return '';
    const face = def.interaction === 'wheel' ? '1' : def.interaction ? '5' : '';
    const set = this.frames(def, 0, true, face);
    const wrap = new Container();
    const g = new Graphics();
    paintFurniture(g, def, 0, 0, true, artStateKey(def, face));
    g.position.set(-set.offsetX, -set.offsetY);
    wrap.addChild(g);
    const canvas = this.renderer.extract.canvas({ target: wrap, resolution: ATLAS_RES }) as HTMLCanvasElement;
    const url = canvas.toDataURL ? canvas.toDataURL('image/png') : '';
    wrap.destroy({ children: true });
    this.previews.set(defId, url);
    return url;
  }

  /** Render any display object to a canvas with the game's renderer (room browser thumbnails). */
  snapshot(target: Container, resolution: number): HTMLCanvasElement | null {
    if (!this.renderer) return null;
    return this.renderer.extract.canvas({ target, resolution }) as HTMLCanvasElement;
  }

  clear() {
    // holodice strips share one source between several frame sets: destroy each source once
    const sources = new Set<TextureSource>();
    for (const set of this.cache.values())
      for (const t of set.textures) {
        sources.add(t.source);
        t.destroy(false);
      }
    for (const s of sources) s.destroy();
    this.cache.clear();
    this.previews.clear();
  }
}

export const atlas = new FurnitureAtlas();
