import { describe, expect, it } from 'vitest';
import { kitchen } from '@dovey/shared';
import { planTap } from './tapControls';
import { Controls } from './controls';

const lv = kitchen.parseLevel(kitchen.LEVELS.diner);
const spawn = { x: 2.5, y: 2.5 };

describe('planTap', () => {
  it('walks to a floor tile through walkable tiles', () => {
    const p = planTap(lv, spawn, { x: 10, y: 6 })!;
    expect(p.action).toBe('walk');
    expect(p.path[p.path.length - 1]).toEqual({ x: 10, y: 6 });
    for (const t of p.path) expect(lv.solid[t.y * lv.w + t.x]).toBe(false);
  });

  it('stands beside a station, facing it', () => {
    const crate = planTap(lv, spawn, { x: 1, y: 0 })!;
    expect(crate.goal).toEqual({ x: 1, y: 1 });
    expect(crate.face).toEqual({ x: 0, y: -1 });
    expect(crate.station).toEqual({ x: 1, y: 0 });
    const board = planTap(lv, spawn, { x: 0, y: 1 }, 'hold')!;
    expect(board.goal).toEqual({ x: 1, y: 1 });
    expect(board.face).toEqual({ x: -1, y: 0 });
    expect(board.action).toBe('hold');
    // island counter (5,3): picks the nearer side
    expect(planTap(lv, { x: 5.5, y: 2.5 }, { x: 5, y: 3 })!.goal).toEqual({ x: 5, y: 2 });
  });

  it('gives up on tiles with no free side and outside the level', () => {
    expect(planTap(lv, spawn, { x: 0, y: 0 })).toBeNull();
    expect(planTap(lv, spawn, { x: -1, y: 4 })).toBeNull();
  });
});

function simulate(c: Controls, chef: kitchen.MovingChef, ticks: number, stations = lv.stations) {
  c.context = { pose: () => chef, stations: () => stations };
  const inputs: kitchen.KitchenInput[] = [];
  for (let t = 0; t < ticks; t++) {
    const inp = c.next();
    inputs.push(inp);
    kitchen.moveChef(chef, inp, kitchen.K_DT, lv.solid, lv.w, lv.h);
  }
  return inputs;
}

describe('TapPilot via Controls', () => {
  it('walks to the crate side and sends exactly one grab facing it', () => {
    const c = new Controls();
    const chef: kitchen.MovingChef = { ...spawn, fx: 0, fy: 1, dash: 0, dashCd: 0 };
    c.pilot.start(planTap(lv, chef, { x: 1, y: 0 })!);
    let facedCrate = false;
    c.context = { pose: () => chef, stations: () => lv.stations };
    let grabs = 0;
    for (let t = 0; t < 120; t++) {
      const inp = c.next();
      kitchen.moveChef(chef, inp, kitchen.K_DT, lv.solid, lv.w, lv.h);
      if (inp.grab) {
        grabs++;
        facedCrate = Math.floor(chef.x + chef.fx * kitchen.REACH) === 1 && Math.floor(chef.y + chef.fy * kitchen.REACH) === 0;
      }
    }
    expect(grabs).toBe(1);
    expect(facedCrate).toBe(true);
    expect(c.pilot.active).toBe(false);
  });

  it('holds chop while pressed and stops on release', () => {
    const c = new Controls();
    const chef: kitchen.MovingChef = { ...spawn, fx: 0, fy: 1, dash: 0, dashCd: 0 };
    c.pilot.start(planTap(lv, chef, { x: 0, y: 1 }, 'hold')!);
    c.pilot.holding = true;
    const held = simulate(c, chef, 90);
    expect(held.slice(-10).every((i) => i.use)).toBe(true);
    c.pilot.holding = false;
    const after = simulate(c, chef, 3);
    expect(after.some((i) => i.use)).toBe(false);
    expect(c.pilot.active).toBe(false);
  });

  it('a pending press waits at the station until decided', () => {
    const c = new Controls();
    const chef: kitchen.MovingChef = { ...spawn, fx: 0, fy: 1, dash: 0, dashCd: 0 };
    c.pilot.start(planTap(lv, chef, { x: 0, y: 1 }, 'pending')!);
    expect(simulate(c, chef, 80).some((i) => i.grab || i.use)).toBe(false);
    c.pilot.decide('grab');
    expect(simulate(c, chef, 2)[0].grab).toBe(true);
  });

  it('game keys cancel an active tap path, other keys do not', () => {
    const c = new Controls();
    const chef: kitchen.MovingChef = { ...spawn, fx: 0, fy: 1, dash: 0, dashCd: 0 };
    c.pilot.start(planTap(lv, chef, { x: 10, y: 6 })!);
    simulate(c, chef, 3);
    expect(c.pilot.active).toBe(true);
    c.keyDown('MetaLeft');
    c.keyDown('Tab');
    expect(c.pilot.active).toBe(true);
    c.keyDown('Space');
    expect(c.pilot.active).toBe(false);
  });

  it('a blocked path reports once with the press state so the caller can replan', () => {
    const c = new Controls();
    const chef: kitchen.MovingChef = { ...spawn, fx: 0, fy: 1, dash: 0, dashCd: 0 };
    const plan = planTap(lv, chef, { x: 0, y: 1 }, 'pending')!;
    c.pilot.start(plan);
    c.pilot.holding = true;
    const blocked: Array<[boolean, boolean]> = [];
    c.pilot.onBlocked = (p, holding) => blocked.push([p === plan, holding]);
    // the chef never moves (something in the way)
    c.context = { pose: () => chef, stations: () => lv.stations };
    for (let t = 0; t < 60; t++) c.next();
    expect(blocked).toEqual([[true, true]]);
    expect(c.pilot.active).toBe(false);
  });

  it('keys are screen-relative and grab gets aim assist', () => {
    const c = new Controls();
    c.keyDown('KeyW');
    const up = c.next();
    expect(up.mx).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(up.my).toBeCloseTo(-Math.SQRT1_2, 6);
    c.keyUp('KeyW');
    // the tap latch keeps a quick press walking for a couple more samples
    c.next();
    c.next();
    expect(c.next()).toMatchObject({ mx: 0, my: 0 });
    const chef: kitchen.MovingChef = { x: 1.5, y: 1.3, fx: -Math.SQRT1_2, fy: -Math.SQRT1_2, dash: 0, dashCd: 0 };
    c.context = { pose: () => chef, stations: () => lv.stations };
    c.pressGrab();
    const g = c.next();
    expect(g.grab).toBe(true);
    expect(Math.hypot(g.mx, g.my)).toBeGreaterThan(kitchen.DEADZONE);
    expect(Math.abs(g.mx) < 1e-9 || Math.abs(g.my) < 1e-9).toBe(true);
  });

  it('dashes toward a tapped direction', () => {
    const c = new Controls();
    c.dashToward({ x: 0, y: 3 });
    expect(c.next()).toMatchObject({ mx: 0, my: 1, dash: true });
    expect(c.next().dash).toBe(false);
  });
});
