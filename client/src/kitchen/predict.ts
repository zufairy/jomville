import { kitchen } from '@dovey/shared';
import type { Pose } from './interp';

export const SNAP_DIST = 0.3;
const SMOOTH_MS = 100;
const MAX_PENDING = 120;

interface Pending {
  inp: kitchen.KitchenInput;
  /** dash timers right before this input ran, so a replay dashes exactly like the first time */
  dash: number;
  dashCd: number;
}

/**
 * Local chef movement prediction: move at once on input, then on each snapshot restart
 * from the server position and replay the inputs it hasn't applied yet. Small corrections
 * are hidden in a decaying render offset; big ones snap.
 */
export class Predictor {
  private pending: Pending[] = [];
  private me: kitchen.MovingChef | null = null;
  private ox = 0;
  private oy = 0;

  constructor(
    private solid: boolean[],
    private w: number,
    private h: number,
  ) {}

  input(inp: kitchen.KitchenInput) {
    if (!this.me) return;
    this.pending.push({ inp, dash: this.me.dash, dashCd: this.me.dashCd });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    kitchen.moveChef(this.me, inp, kitchen.K_DT, this.solid, this.w, this.h);
  }

  reconcile(server: kitchen.ChefSnap, ack: number) {
    this.pending = this.pending.filter((p) => p.inp.seq > ack);
    const first = this.pending[0];
    const next: kitchen.MovingChef = {
      x: server.x,
      y: server.y,
      fx: server.fx,
      fy: server.fy,
      dash: first ? first.dash : (this.me?.dash ?? 0),
      dashCd: first ? first.dashCd : (this.me?.dashCd ?? 0),
    };
    for (const p of this.pending) {
      p.dash = next.dash;
      p.dashCd = next.dashCd;
      kitchen.moveChef(next, p.inp, kitchen.K_DT, this.solid, this.w, this.h);
    }
    if (this.me) {
      const ex = this.me.x + this.ox - next.x;
      const ey = this.me.y + this.oy - next.y;
      if (Math.hypot(ex, ey) < SNAP_DIST) {
        this.ox = ex;
        this.oy = ey;
      } else {
        this.ox = 0;
        this.oy = 0;
      }
    }
    this.me = next;
  }

  frame(dtMs: number) {
    const k = Math.exp(-dtMs / SMOOTH_MS);
    this.ox *= k;
    this.oy *= k;
  }

  /** where the sim has the chef (no display smoothing): what controls must aim from */
  simPose(): Pose | null {
    return this.me && { x: this.me.x, y: this.me.y, fx: this.me.fx, fy: this.me.fy };
  }

  /** display pose: sim pose plus the decaying correction offset */
  pose(): Pose | null {
    return this.me && { x: this.me.x + this.ox, y: this.me.y + this.oy, fx: this.me.fx, fy: this.me.fy };
  }
}
