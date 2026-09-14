import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { FURNITURE, PALETTE, footprint, furnitureDef, seatFacing, tileToScreen } from '@dovey/shared';
import { CASINO_PAINTERS } from './casinoArt';

/** paints a casino piece through its real painter into a stub Graphics and returns the pixels it drew */
function render(defId: string, rot: number) {
  const def = furnitureDef(defId)!;
  const { w, h } = footprint(def, rot);
  const centre = tileToScreen(w / 2, h / 2);
  const px = new Map<string, number>();
  let pending: [number, number, number, number] | null = null;
  const g = {
    rect(x: number, y: number, rw: number, rh: number) {
      pending = [x, y, rw, rh];
      return g;
    },
    fill(colour: number) {
      const [x, y, rw, rh] = pending!;
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) px.set(`${i},${j}`, colour);
      return g;
    },
  };
  CASINO_PAINTERS[def.kind](g as unknown as Graphics, {
    def, rot, frame: 0, t: 0, on: true, state: '', w, h,
    top: PALETTE[def.colours[0]], side: PALETTE[def.colours[1]], cx: centre.x, cy: centre.y,
  });
  return { px, cx: centre.x, w, h };
}

const key = (m: Map<string, number>) => [...m.entries()].map(([k, c]) => `${k}=${c}`).sort().join(';');
/** mirrors a drawing about its footprint centre `from` and re-anchors it on the centre `to` */
const mirror = (m: Map<string, number>, from: number, to: number) => {
  const out = new Map<string, number>();
  for (const [k, c] of m) {
    const [x, y] = k.split(',').map(Number);
    out.set(`${from + to - x - 1},${y}`, c);
  }
  return out;
};

/** backrest top per seat, world px above the floor */
const BACK_TOP: Record<string, number> = { trade_sofa: 42, throne_gold: 56 };

/**
 * Which footprint edge the backrest's top stands on. The drawing's top silhouette
 * (the backrest, the tallest part) is fitted to the iso line running along the
 * seat, over the middle columns, and compared with the back and front edge lines
 * lifted by the backrest height. Unlike a single probe this ignores occlusion.
 */
function backrestEdge(px: Map<string, number>, rot: number, w: number, h: number, top: number): 'back' | 'front' {
  const fwd = [[0, -1], [1, 0], [0, 1], [-1, 0]][seatFacing(rot)];
  const slope = rot % 2 === 0 ? 0.5 : -0.5;
  const edgeOffset = (s: number) => {
    const p = tileToScreen(w / 2 + (s * fwd[0] * w) / 2, h / 2 + (s * fwd[1] * h) / 2);
    return { x: p.x, b: p.y - top - slope * p.x };
  };
  const back = edgeOffset(-1);
  const front = edgeOffset(1);
  const tops = new Map<number, number>();
  for (const k of px.keys()) {
    const [x, y] = k.split(',').map(Number);
    if (Math.abs(x - back.x) <= 16) tops.set(x, Math.min(tops.get(x) ?? Infinity, y));
  }
  const b = [...tops].reduce((s, [x, y]) => s + (y - slope * x), 0) / tops.size;
  return Math.abs(b - back.b) < Math.abs(b - front.b) ? 'back' : 'front';
}

describe('casino seats face the way their seat does', () => {
  const seats = FURNITURE.filter((d) => d.cat === 'casino' && d.sit).map((d) => d.id);

  it('covers every casino seat', () => {
    expect(seats.sort()).toEqual(['throne_gold', 'trade_sofa']);
  });

  for (const id of ['trade_sofa', 'throne_gold']) {
    it(`${id}: the backrest stands on the edge opposite seatFacing in all four rotations`, () => {
      for (let rot = 0; rot < 4; rot++) {
        const { px, w, h } = render(id, rot);
        expect(backrestEdge(px, rot, w, h, BACK_TOP[id]), `${id} rot ${rot}`).toBe('back');
      }
    });

    it(`${id}: half turns differ, quarter turns are mirrors of the matching facing`, () => {
      const r = [0, 1, 2, 3].map((rot) => render(id, rot));
      expect(key(r[2].px)).not.toBe(key(r[0].px));
      expect(key(r[3].px)).not.toBe(key(r[1].px));
      // rot 3 (backrest on the far x=0 edge) is rot 0 seen in a mirror; rot 1 (near x=w edge) is rot 2 mirrored
      expect(key(r[3].px)).toBe(key(mirror(r[0].px, r[0].cx, r[3].cx)));
      expect(key(r[1].px)).toBe(key(mirror(r[2].px, r[2].cx, r[1].cx)));
    });
  }

  it('trade sofa shows its tufted face only when it faces the viewer', () => {
    const TUFT = 0x5e0a1e;
    for (let rot = 0; rot < 4; rot++) {
      const toward = [1, 2].includes(seatFacing(rot));
      const tufts = [...render('trade_sofa', rot).px.values()].filter((c) => c === TUFT).length;
      expect(tufts > 0, `rot ${rot}`).toBe(toward);
    }
  });
});
