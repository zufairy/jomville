import { CanvasSource, Texture } from 'pixi.js';
import { CLEAR, PixelMap } from '../game/pixelArt';

/** A pixel map as straight RGBA, one art pixel per texel. */
export function mapToRGBA(map: PixelMap): { w: number; h: number; data: Uint8ClampedArray } {
  const h = map.rows.length;
  const w = map.rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(w * h * 4);
  map.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const k = row[x];
      if (k === CLEAR) continue;
      const c = map.palette[k] ?? 0xff00ff;
      const i = (y * w + x) * 4;
      data[i] = (c >> 16) & 255;
      data[i + 1] = (c >> 8) & 255;
      data[i + 2] = c & 255;
      data[i + 3] = 255;
    }
  });
  return { w, h, data };
}

function mapCanvas(map: PixelMap, scale = 1): HTMLCanvasElement {
  const { w, h, data } = mapToRGBA(map);
  const src = document.createElement('canvas');
  src.width = Math.max(1, w);
  src.height = Math.max(1, h);
  const ctx = src.getContext('2d')!;
  if (w && h) ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  if (scale === 1) return src;
  const out = document.createElement('canvas');
  out.width = src.width * scale;
  out.height = src.height * scale;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  o.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

const textures = new WeakMap<PixelMap, Texture>();

/** GPU texture for a map, made once per map object; nearest sampling keeps pixels crisp. */
export function mapTexture(map: PixelMap): Texture {
  let t = textures.get(map);
  if (!t) {
    const source = new CanvasSource({ resource: mapCanvas(map), scaleMode: 'nearest', autoGenerateMipmaps: false });
    t = new Texture({ source });
    textures.set(map, t);
  }
  return t;
}

const urls = new WeakMap<PixelMap, string>();

/** PNG data URL for HUD icons (scaled up with hard edges). */
export function mapDataUrl(map: PixelMap, scale = 3): string {
  let u = urls.get(map);
  if (u === undefined) {
    try {
      u = mapCanvas(map, scale).toDataURL('image/png');
    } catch {
      u = '';
    }
    urls.set(map, u);
  }
  return u;
}
