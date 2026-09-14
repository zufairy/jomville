import { CHEF_R, CHEF_SPEED, DASH_COOLDOWN, DASH_MULT, DASH_TIME, DEADZONE } from './constants';

export type MovingChef = { x: number; y: number; fx: number; fy: number; dash: number; dashCd: number };

const EPS = 1e-6;

export function isSolid(solid: boolean[], w: number, h: number, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
  return solid[ty * w + tx];
}

/** Chefs collide as squares of half-size CHEF_R; resolving one axis at a time lets them slide along counters. */
function resolve(b: { x: number; y: number }, solid: boolean[], w: number, h: number, axis: 'x' | 'y') {
  const minX = Math.floor(b.x - CHEF_R + EPS);
  const maxX = Math.floor(b.x + CHEF_R - EPS);
  const minY = Math.floor(b.y - CHEF_R + EPS);
  const maxY = Math.floor(b.y + CHEF_R - EPS);
  for (let ty = minY; ty <= maxY; ty++)
    for (let tx = minX; tx <= maxX; tx++) {
      if (!isSolid(solid, w, h, tx, ty)) continue;
      if (axis === 'x') b.x = b.x < tx + 0.5 ? Math.min(b.x, tx - CHEF_R) : Math.max(b.x, tx + 1 + CHEF_R);
      else b.y = b.y < ty + 0.5 ? Math.min(b.y, ty - CHEF_R) : Math.max(b.y, ty + 1 + CHEF_R);
    }
}

/** Steps must stay under half a tile (a dash tick is 0.45) so a chef never tunnels through a counter. */
export function moveBody(b: { x: number; y: number }, dx: number, dy: number, solid: boolean[], w: number, h: number) {
  b.x += dx;
  resolve(b, solid, w, h, 'x');
  b.y += dy;
  resolve(b, solid, w, h, 'y');
}

export function moveChef(c: MovingChef, inp: { mx: number; my: number; dash: boolean }, dt: number, solid: boolean[], w: number, h: number) {
  let mx = Number.isFinite(inp.mx) ? Math.max(-1, Math.min(1, inp.mx)) : 0;
  let my = Number.isFinite(inp.my) ? Math.max(-1, Math.min(1, inp.my)) : 0;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const steering = len > DEADZONE;
  if (steering) {
    const l = Math.hypot(mx, my);
    c.fx = mx / l;
    c.fy = my / l;
  }
  c.dashCd = Math.max(0, c.dashCd - dt);
  if (inp.dash && c.dashCd <= 0) {
    c.dash = DASH_TIME;
    c.dashCd = DASH_COOLDOWN;
  }
  if (c.dash > 0) {
    const v = CHEF_SPEED * DASH_MULT;
    c.dash = Math.max(0, c.dash - dt);
    moveBody(c, c.fx * v * dt, c.fy * v * dt, solid, w, h);
    return;
  }
  if (!steering) return;
  moveBody(c, mx * CHEF_SPEED * dt, my * CHEF_SPEED * dt, solid, w, h);
}

/** Soft push between overlapping chefs. Callers pass chefs in a stable order (sorted ids) to stay deterministic. */
export function separateChefs(chefs: Array<{ x: number; y: number }>, solid: boolean[], w: number, h: number) {
  const min = CHEF_R * 2;
  for (let i = 0; i < chefs.length; i++)
    for (let j = i + 1; j < chefs.length; j++) {
      const a = chefs[i];
      const b = chefs[j];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist >= min) continue;
      const nx = dist < EPS ? 1 : (b.x - a.x) / dist;
      const ny = dist < EPS ? 0 : (b.y - a.y) / dist;
      const push = (min - dist) / 4;
      moveBody(a, -nx * push, -ny * push, solid, w, h);
      moveBody(b, nx * push, ny * push, solid, w, h);
    }
}
