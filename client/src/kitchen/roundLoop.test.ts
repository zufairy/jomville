import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { Controls, InputClock, MAX_CATCHUP } from './controls';
import { Predictor } from './predict';
import { applySnap, createView } from './view';
import { planTap } from './tapControls';

/**
 * End-to-end client input loop against the real sim, like a live round:
 * Controls (pilot / keys) -> k_in -> server step -> delayed snapshots ->
 * view + predictor reconcile. Catches anything that stops a chef playing.
 */
function round(lagTicks = 4) {
  const sim = kitchen.createKitchen('diner', 7, ['me']);
  const view = createView('diner');
  const predictor = new Predictor(view.solid, view.w, view.h);
  const controls = new Controls();
  controls.context = { pose: () => predictor.simPose(), stations: () => view.stations, held: () => view.chefs.find((c) => c.id === 'me')?.held ?? null };
  const inflight: Array<{ at: number; inp: kitchen.KitchenInput }> = [];
  const snaps: Array<{ at: number; snap: kitchen.KitchenSnap }> = [];
  let t = 0;
  let rev = 0;
  const deliverSnaps = () => {
    while (snaps.length && snaps[0].at <= t) {
      const { snap } = snaps.shift()!;
      applySnap(view, snap, t);
      const mine = snap.chefs.find((c) => c.id === 'me');
      if (mine) predictor.reconcile(mine, snap.acks.me ?? 0);
    }
  };
  // hello + first full snapshot
  snaps.push({ at: 0, snap: kitchen.makeSnap(sim, 0, true) });
  deliverSnaps();
  const tick = () => {
    t++;
    const inp = controls.next();
    inflight.push({ at: t + lagTicks, inp: JSON.parse(JSON.stringify(inp)) });
    predictor.input(inp);
    const due = inflight.filter((m) => m.at <= t);
    for (const m of due) inflight.splice(inflight.indexOf(m), 1);
    const inputs: Record<string, kitchen.KitchenInput> = {};
    if (due.length) inputs.me = { ...due[due.length - 1].inp, grab: due.some((d) => d.inp.grab) };
    kitchen.step(sim, inputs);
    if (t % 2 === 0) {
      snaps.push({ at: t + lagTicks, snap: kitchen.makeSnap(sim, rev, false) });
      rev = sim.rev;
    }
    predictor.frame(33);
    deliverSnaps();
  };
  return { sim, view, predictor, controls, tick, chef: () => sim.chefs.me };
}

describe('Predictor poses', () => {
  it('simPose is the sim position; pose adds the smoothing offset controls must not aim from', () => {
    const lv = kitchen.parseLevel(kitchen.LEVELS.diner);
    const p = new Predictor(lv.solid, lv.w, lv.h);
    const snap = (x: number) => ({ id: 'me', x, y: 2.5, fx: 1, fy: 0, held: null, chop: false, dash: false });
    p.reconcile(snap(2.5), 0);
    // the server disagrees by 0.2 tile: display eases, sim jumps
    p.reconcile(snap(2.7), 0);
    expect(p.simPose()!.x).toBeCloseTo(2.7, 6);
    expect(p.pose()!.x).toBeCloseTo(2.5, 6);
  });
});

describe('InputClock', () => {
  it('sends one input per tick on time, catches up (capped) when the timer runs late', () => {
    const c = new InputClock();
    const period = 1000 / kitchen.K_TICK_HZ;
    let sent = c.due(0);
    // jittery but on-time timer for 3 seconds
    for (let i = 1; i <= 90; i++) sent += c.due(i * period + (i % 3 === 0 ? 6 : -4));
    expect(sent).toBeGreaterThanOrEqual(89);
    expect(sent).toBeLessThanOrEqual(92);
    // a throttled tab firing twice a second still sends several ticks per call
    expect(c.due(90 * period + 500)).toBe(MAX_CATCHUP);
  });
});

describe('live round input loop', () => {
  it('in a throttled tab (timer at 2/s) a held key still walks, via catch-up inputs', () => {
    const r = round(0);
    const clock = new InputClock();
    const start = r.chef().x + r.chef().y;
    r.controls.keyDown('KeyS');
    // the timer fires every 500ms for 3s; each call sends the inputs that are due
    for (let call = 0; call <= 6; call++) {
      const n = clock.due(call * 500);
      for (let i = 0; i < n; i++) r.tick();
    }
    r.controls.keyUp('KeyS');
    expect(r.chef().x + r.chef().y - start).toBeGreaterThan(2);
  });

  it('from the Diner spawn, a tap on the onion crate walks beside it, faces it and picks up an onion', () => {
    const r = round();
    const pose = r.predictor.pose()!;
    const plan = planTap(r.view, pose, { x: 3, y: 0 }, 'pending')!;
    expect(plan.goal).toEqual({ x: 3, y: 1 });
    r.controls.pilot.start(plan);
    r.controls.pilot.holding = true;
    r.tick();
    // a quick click: released right away -> grab
    r.controls.pilot.decide('grab');
    r.controls.pilot.holding = false;
    for (let i = 0; i < 90; i++) r.tick();
    const c = r.chef();
    expect(Math.floor(c.x)).toBe(3);
    expect(Math.floor(c.y)).toBe(1);
    expect(c.held).toEqual({ kind: 'ing', ing: 'onion', chopped: false });
  });

  it('a hold on the board chops what is on it', () => {
    const r = round();
    r.sim.stations.find((s) => s.kind === 'board' && s.x === 0 && s.y === 1)!.item = { kind: 'ing', ing: 'tomato', chopped: false };
    r.controls.pilot.start(planTap(r.view, r.predictor.pose()!, { x: 0, y: 1 }, 'hold')!);
    r.controls.pilot.holding = true;
    for (let i = 0; i < 150; i++) r.tick();
    expect(r.sim.stations.find((s) => s.x === 0 && s.y === 1)!.item).toEqual({ kind: 'ing', ing: 'tomato', chopped: true });
  });

  it('quick key taps still move the chef: 15 taps of S go several tiles', () => {
    const r = round();
    const start = { x: r.chef().x, y: r.chef().y };
    for (let i = 0; i < 15; i++) {
      // keydown and keyup both land between two input samples
      r.controls.keyDown('KeyS');
      r.controls.keyUp('KeyS');
      for (let k = 0; k < 6; k++) r.tick();
    }
    for (let k = 0; k < 10; k++) r.tick();
    expect(Math.hypot(r.chef().x - start.x, r.chef().y - start.y)).toBeGreaterThan(2.5);
  });

  it('holding a key walks at full speed and Space grabs from the crate in reach', () => {
    const r = round();
    // walk up-left on screen (world -x,-y) from spawn toward the crates corner
    r.controls.keyDown('KeyW');
    for (let k = 0; k < 20; k++) r.tick();
    r.controls.keyUp('KeyW');
    for (let k = 0; k < 8; k++) r.tick();
    const c = r.chef();
    expect(c.y).toBeLessThan(1.8);
    r.controls.keyDown('Space');
    r.controls.keyUp('Space');
    for (let k = 0; k < 10; k++) r.tick();
    expect(r.chef().held?.kind).toBe('ing');
  });
});
