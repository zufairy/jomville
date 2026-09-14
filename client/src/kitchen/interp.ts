export interface Pose {
  x: number;
  y: number;
  fx: number;
  fy: number;
}

export const INTERP_DELAY_MS = 100;
const MAX_EXTRAP_MS = 150;
const KEEP_FRAMES = 30;

/** Other chefs are drawn INTERP_DELAY_MS in the past, blended between the two snapshots around that time. */
export class Interp {
  private frames: Array<{ at: number; chefs: Map<string, Pose> }> = [];

  push(at: number, chefs: Array<Pose & { id: string }>) {
    this.frames.push({ at, chefs: new Map(chefs.map((c) => [c.id, { x: c.x, y: c.y, fx: c.fx, fy: c.fy }])) });
    if (this.frames.length > KEEP_FRAMES) this.frames.shift();
  }

  sample(id: string, now: number): Pose | null {
    const f = this.frames;
    if (!f.length) return null;
    const t = now - INTERP_DELAY_MS;
    let i = f.length - 1;
    while (i > 0 && f[i].at > t) i--;
    const a = f[i].chefs.get(id);
    if (!a) return f[f.length - 1].chefs.get(id) ?? null;
    if (f[i].at > t) return a;
    const next = f[i + 1];
    if (next) {
      const b = next.chefs.get(id);
      if (!b) return a;
      const k = (t - f[i].at) / (next.at - f[i].at);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, fx: b.fx, fy: b.fy };
    }
    const prevF = f[i - 1];
    const p = prevF?.chefs.get(id);
    if (!p || prevF.at === f[i].at) return a;
    const k = Math.min(t - f[i].at, MAX_EXTRAP_MS) / (f[i].at - prevF.at);
    return { x: a.x + (a.x - p.x) * k, y: a.y + (a.y - p.y) * k, fx: a.fx, fy: a.fy };
  }
}
