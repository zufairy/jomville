import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import { furnitureDef } from '@dovey/shared';
import { artBounds, paintFurniture } from '../game/furnitureArt';

/** Independent of the room renderer, so collections work before entering a room. */
export function FurniturePreview({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const def = furnitureDef(id);
    if (!def || !host.current) return;
    const container = host.current;
    const app = new Application();
    let cancelled = false;
    let ready = false;
    void app.init({ width: 180, height: 140, backgroundAlpha: 0, antialias: true, resolution: 2, autoDensity: true }).then(() => {
      ready = true;
      if (cancelled) { app.destroy(true, { children: true }); return; }
      container.appendChild(app.canvas);
      const art = new Graphics();
      const b = artBounds(def, 0);
      const scale = Math.min(180 / b.w, 140 / b.h);
      art.scale.set(scale);
      art.position.set((180 - b.w * scale) / 2 - b.x * scale, (140 - b.h * scale) / 2 - b.y * scale);
      app.stage.addChild(art);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let frame = 0;
      app.ticker.maxFPS = 15;
      app.ticker.add(() => { art.clear(); paintFurniture(art, def, 0, reduced ? 0 : frame++ % 8, true); });
    }).catch(() => { /* The item name remains visible if WebGL is unavailable. */ });
    return () => { cancelled = true; if (ready) app.destroy(true, { children: true }); };
  }, [id]);
  return <div ref={host} className="profile-item-art" role="img" aria-label={furnitureDef(id)?.name ?? id} />;
}
