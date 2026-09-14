import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { applySnap, createView, orderLeft } from './view';
import { Interp } from './interp';
import { Predictor } from './predict';
import { Controls } from './controls';

describe('view', () => {
  it('applies full then delta snapshots and ignores stale ones', () => {
    const s = kitchen.createKitchen('diner', 1, ['a']);
    const v = createView('diner');
    expect(applySnap(v, kitchen.makeSnap(s, 0, true), 1000)).toBe(true);
    const rev = s.rev;
    s.stations[3].count = 7;
    s.stations[3].v = ++s.rev;
    s.orders.push({ id: 1, dish: 'salad', left: 30, total: 60 });
    s.ordersV = ++s.rev;
    s.tick = 5;
    applySnap(v, kitchen.makeSnap(s, rev, false), 2000);
    expect(v.stations[3].count).toBe(7);
    expect(orderLeft(v.orders[0], 12_000)).toBeCloseTo(20, 6);
    s.tick = 2;
    expect(applySnap(v, kitchen.makeSnap(s, 0, true), 3000)).toBe(false);
  });
});

describe('Interp', () => {
  const chef = (x: number) => ({ id: 'b', x, y: 1, fx: 1, fy: 0 });
  it('interpolates 100ms in the past and extrapolates at most 150ms', () => {
    const i = new Interp();
    i.push(0, [chef(0)]);
    i.push(50, [chef(1)]);
    expect(i.sample('b', 50)?.x).toBe(0); // older than the first frame
    expect(i.sample('b', 125)?.x).toBeCloseTo(0.5, 6);
    expect(i.sample('b', 175)?.x).toBeCloseTo(1.5, 6);
    expect(i.sample('b', 1000)?.x).toBeCloseTo(4, 6);
    expect(i.sample('zz', 125)).toBeNull();
  });
});

describe('Predictor', () => {
  it('stays within a hair of the server under ~170ms of latency', () => {
    const lv = kitchen.parseLevel(kitchen.LEVELS.diner);
    const server: kitchen.MovingChef = { x: 2.5, y: 2.5, fx: 0, fy: 1, dash: 0, dashCd: 0 };
    const p = new Predictor(lv.solid, lv.w, lv.h);
    p.reconcile({ id: 'a', x: 2.5, y: 2.5, fx: 0, fy: 1, held: null, chop: false, dash: false }, 0);
    const LAG = 5;
    const history: Array<{ x: number; y: number; fx: number; fy: number; seq: number }> = [];
    let worst = 0;
    for (let seq = 1; seq <= 300; seq++) {
      const inp = { seq, mx: Math.sin(seq / 20), my: Math.cos(seq / 13), grab: false, use: false, dash: seq % 90 === 0 };
      p.input(inp);
      kitchen.moveChef(server, inp, kitchen.K_DT, lv.solid, lv.w, lv.h);
      history.push({ x: server.x, y: server.y, fx: server.fx, fy: server.fy, seq });
      const seen = history[history.length - 1 - LAG];
      if (seen) {
        p.reconcile({ id: 'a', ...seen, held: null, chop: false, dash: false }, seen.seq);
        const pose = p.pose()!;
        worst = Math.max(worst, Math.hypot(pose.x - server.x, pose.y - server.y));
      }
      p.frame(33);
    }
    expect(worst).toBeLessThan(0.05);
  });
});

describe('Controls', () => {
  it('turns presses into one-shot edges and falls back to the stick', () => {
    const c = new Controls();
    c.pressGrab();
    c.setStick(0.5, -1);
    expect(c.next()).toMatchObject({ seq: 1, mx: 0.5, my: -1, grab: true, dash: false });
    expect(c.next()).toMatchObject({ seq: 2, grab: false });
    c.setUse(true);
    expect(c.next().use).toBe(true);
  });
});
