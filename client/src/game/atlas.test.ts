import { describe, expect, it } from 'vitest';
import { Texture, TextureSource } from 'pixi.js';
import type { Graphics, Renderer } from 'pixi.js';
import { furnitureDef } from '@dovey/shared';
import { ATLAS_RES, atlas } from './atlas';
import { HOLO_IDLE_FRAMES, holoLockSequence } from './casinoPixels';
import { artBounds, paintFurniture } from './furnitureArt';

/** the old bake path's pixels: the painter's rects rasterised at ATLAS_RES inside the art bounds */
function rasterise(sk: string, frame: number): Uint8ClampedArray {
  const def = furnitureDef('holodice')!;
  const b = artBounds(def, 0);
  const W = b.w * ATLAS_RES;
  const out = new Uint8ClampedArray(W * b.h * ATLAS_RES * 4);
  let r: number[] = [];
  const g = {
    rect: (...a: number[]) => ((r = a), g),
    fill: (c: number) => {
      const [x, y, w, h] = r.map((v) => v * ATLAS_RES);
      const ox = -b.x * ATLAS_RES;
      const oy = -b.y * ATLAS_RES;
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++) {
          const k = ((j + oy) * W + i + ox) * 4;
          out.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], k);
        }
      return g;
    },
  };
  paintFurniture(g as unknown as Graphics, def, 0, frame, true, sk);
  return out;
}

describe('furniture atlas: holodice reveals', () => {
  const made = { generated: 0, strips: 0 };
  const strips: Array<{ w: number; h: number; pixels: Uint8ClampedArray }> = [];
  atlas.bind({
    generateTexture: () => {
      made.generated++;
      return new Texture();
    },
  } as unknown as Renderer);
  atlas.stripSource = (w, h, pixels) => {
    made.strips++;
    strips.push({ w, h, pixels });
    return new TextureSource({ width: w / ATLAS_RES, height: h / ATLAS_RES, resolution: ATLAS_RES });
  };
  const def = furnitureDef('holodice')!;
  const reveal = (n: string) => {
    const before = made.generated + made.strips;
    for (const k of holoLockSequence('-1', n)!) atlas.frames(def, 0, true, k);
    const idle = atlas.frames(def, 0, true, n);
    return { cost: made.generated + made.strips - before, idle };
  };

  it('a first reveal of a new number uploads at most one texture for the lock-in pop and idle loop', () => {
    const first = reveal('57');
    expect(first.cost).toBeLessThanOrEqual(1);
    expect(first.idle.textures).toHaveLength(HOLO_IDLE_FRAMES);
    expect(reveal('58').cost).toBeLessThanOrEqual(1);
    // a number already seen costs nothing
    expect(reveal('57').cost).toBe(0);
  });

  it('keeps the per-frame placement and the idle speed', () => {
    const b = artBounds(def, 0);
    for (const k of ['lock1:57', 'lock3:57', '57']) {
      const set = atlas.frames(def, 0, true, k);
      expect([set.offsetX, set.offsetY], k).toEqual([b.x, b.y]);
      for (const t of set.textures) expect([t.frame.width, t.frame.height], k).toEqual([b.w, b.h]);
    }
    expect(atlas.frames(def, 0, true, '57').fps).toBe(4);
    expect(atlas.frames(def, 0, true, 'lock2:57').fps).toBeNull();
  });

  it('strip frames are pixel-identical to the per-frame rects the renderer used to bake', () => {
    const strip = strips.find((s) => s.pixels.length)!;
    const b = artBounds(def, 0);
    const W = b.w * ATLAS_RES;
    const H = b.h * ATLAS_RES;
    const keys = [...Array.from({ length: HOLO_IDLE_FRAMES }, (_, f) => ['57', f] as const), ['lock1:57', 0] as const, ['lock2:57', 0] as const, ['lock3:57', 0] as const];
    for (const set of [atlas.frames(def, 0, true, '57'), atlas.frames(def, 0, true, 'lock1:57')]) expect(set.textures[0].source).toBeInstanceOf(TextureSource);
    keys.forEach(([sk, f], i) => {
      const want = rasterise(sk, f);
      let diff = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const a = (y * strip.w + i * W + x) * 4;
          const e = (y * W + x) * 4;
          if (strip.pixels[a + 3] !== want[e + 3] || strip.pixels[a] !== want[e] || strip.pixels[a + 1] !== want[e + 1] || strip.pixels[a + 2] !== want[e + 2]) diff++;
        }
      expect(diff, `${sk} frame ${f}`).toBe(0);
    });
    expect(strip.h).toBe(H);
  });
});
