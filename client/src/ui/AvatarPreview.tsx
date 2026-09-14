import { useEffect, useRef } from 'react';
import { AvatarConfig, serializeAvatar } from '@dovey/shared';
import { COLS, FRAME, composite, dirRow, findPart, loadManifest, sheetFor } from '../game/lpc';
import { GEAR_CELL, GEAR_FRAMES, GEAR_FRAME_MS, GEAR_OX, GEAR_OY, GEAR_RES, gearIds, gearSheet } from '../game/gearArt';

/** Layer stack for a look, in draw order. Mirrors the in-game compositor. */
async function sheetsFor(cfg: AvatarConfig) {
  const m = await loadManifest();
  const layers: Array<{ rel: string; z: number }> = [];
  const add = (id: string, variant: string) => {
    const part = findPart(m, id);
    if (!part) return;
    const rel = sheetFor(part, cfg.body, variant);
    if (rel) layers.push({ rel, z: part.z });
  };
  add('body', cfg.skin);
  add('head', cfg.skin);
  add('eyes', cfg.eyes);
  add(cfg.feet, cfg.feetColour);
  add(cfg.legs, cfg.legsColour);
  add(cfg.torso, cfg.torsoColour);
  if (cfg.hair !== 'none') add(cfg.hair, cfg.hairColour);
  if (cfg.hat !== 'none') add(cfg.hat, cfg.hatColour);
  return layers;
}

/**
 * Which part of the 64px frame to show. Catalog cards zoom to the part being
 * chosen so shoes read as shoes rather than four pixels at the bottom.
 */
export type Focus = 'full' | 'head' | 'lower';
const CROP: Record<Focus, [number, number, number, number]> = {
  full: [0, 0, 64, 64],
  head: [14, 2, 36, 36],
  lower: [14, 28, 36, 36],
};

export interface AvatarPreviewProps {
  cfg: AvatarConfig;
  /** rendered size in CSS pixels; the sheet is 64px per frame */
  scale?: number;
  /** walk in place instead of standing still */
  animate?: boolean;
  /** play worn gear's animation (shine, flap, sparkle); on by default when gear is worn */
  fx?: boolean;
  /** 0 up, 1 right, 2 down, 3 left */
  dir?: number;
  focus?: Focus;
  className?: string;
}

/**
 * Canvas preview of a look, drawn from the same sprite sheets and gear art
 * the game uses. Loads asynchronously and paints as soon as the sheets arrive.
 */
export function AvatarPreview({ cfg, scale = 3, animate = true, fx = true, dir = 2, focus = 'full', className }: AvatarPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = serializeAvatar(cfg);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let alive = true;
    const ctx = canvas.getContext('2d')!;

    void (async () => {
      let sheet: HTMLCanvasElement;
      try {
        sheet = (await composite(`p:${key}`, await sheetsFor(cfg))).canvas;
      } catch {
        return;
      }
      if (!alive) return;
      const row = dirRow(dir);
      const [cx, cy, cw, ch] = CROP[focus];
      const ids = gearIds(cfg);
      const back = gearSheet(ids, 'back');
      const front = gearSheet(ids, 'front');
      const loop = animate || (fx && ids.length > 0);
      const px = GEAR_CELL * GEAR_RES;
      const gear = (layer: HTMLCanvasElement | null, f: number) => {
        if (!layer) return;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(layer, f * px + (GEAR_OX + cx) * GEAR_RES, row * px + (GEAR_OY + cy) * GEAR_RES, cw * GEAR_RES, ch * GEAR_RES, 0, 0, canvas.width, canvas.height);
      };
      const start = performance.now();
      const draw = (t: number) => {
        const col = animate ? 1 + (Math.floor((t - start) / 105) % (COLS - 1)) : 0;
        const gf = fx ? Math.floor((t - start) / GEAR_FRAME_MS) % GEAR_FRAMES : 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        gear(back, gf);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheet, col * FRAME + cx, row * FRAME + cy, cw, ch, 0, 0, canvas.width, canvas.height);
        gear(front, gf);
        if (loop) raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [key, cfg, animate, fx, dir, focus]);

  const [, , cw, ch] = CROP[focus];
  return <canvas ref={ref} width={cw * scale} height={ch * scale} className={className} />;
}
