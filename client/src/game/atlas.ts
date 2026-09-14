import { Container, Graphics, Rectangle, Renderer, Texture } from 'pixi.js';
import { FurnitureDef, furnitureDef } from '@dovey/shared';
import { artBounds, paintFurniture } from './furnitureArt';

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
}

export const ATLAS_RES = 2;

class FurnitureAtlas {
  private renderer: Renderer | null = null;
  private cache = new Map<string, FrameSet>();
  private previews = new Map<string, string>();

  bind(renderer: Renderer) {
    this.renderer = renderer;
  }

  get ready() {
    return !!this.renderer;
  }

  frames(def: FurnitureDef, rot: number, on: boolean): FrameSet {
    const key = `${def.id}:${rot}:${on ? 1 : 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.renderer) throw new Error('atlas not bound');
    const b = artBounds(def, rot);
    const frame = new Rectangle(b.x, b.y, b.w, b.h);
    const textures: Texture[] = [];
    for (let f = 0; f < def.anim; f++) {
      const g = new Graphics();
      paintFurniture(g, def, rot, f, on);
      const tex = this.renderer.generateTexture({ target: g, frame, resolution: ATLAS_RES });
      textures.push(tex);
      g.destroy();
    }
    const set = { textures, offsetX: b.x, offsetY: b.y };
    this.cache.set(key, set);
    return set;
  }

  /** PNG data URL of the item at rotation 0, frame 0, switched on — for the shop and build tray. */
  preview(defId: string): string {
    const hit = this.previews.get(defId);
    if (hit) return hit;
    const def = furnitureDef(defId);
    if (!def || !this.renderer) return '';
    const set = this.frames(def, 0, true);
    const wrap = new Container();
    const g = new Graphics();
    paintFurniture(g, def, 0, 0, true);
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
    for (const set of this.cache.values()) for (const t of set.textures) t.destroy(true);
    this.cache.clear();
    this.previews.clear();
  }
}

export const atlas = new FurnitureAtlas();
