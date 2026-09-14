import { describe, expect, it } from 'vitest';
import { CHEF_R, CHEF_SPEED, DASH_COOLDOWN, K_DT } from './constants';
import { MovingChef, isSolid, moveChef, separateChefs } from './physics';

// 5x5 room: walls around, open 3x3 middle
const W = 5;
const H = 5;
const solid = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  return x === 0 || y === 0 || x === W - 1 || y === H - 1;
});
const chef = (x = 2.5, y = 2.5): MovingChef => ({ x, y, fx: 0, fy: 1, dash: 0, dashCd: 0 });
const idle = { mx: 0, my: 0, dash: false };

describe('physics', () => {
  it('treats out of bounds as solid', () => {
    expect(isSolid(solid, W, H, -1, 2)).toBe(true);
    expect(isSolid(solid, W, H, 2, 2)).toBe(false);
  });

  it('walks at CHEF_SPEED and turns to face the stick', () => {
    const c = chef();
    moveChef(c, { mx: 1, my: 0, dash: false }, K_DT, solid, W, H);
    expect(c.x).toBeCloseTo(2.5 + CHEF_SPEED * K_DT, 6);
    expect([c.fx, c.fy]).toEqual([1, 0]);
  });

  it('normalizes diagonals and ignores the deadzone', () => {
    const c = chef();
    moveChef(c, { mx: 1, my: 1, dash: false }, K_DT, solid, W, H);
    expect(Math.hypot(c.x - 2.5, c.y - 2.5)).toBeCloseTo(CHEF_SPEED * K_DT, 6);
    const d = chef();
    moveChef(d, { mx: 0.1, my: 0, dash: false }, K_DT, solid, W, H);
    expect([d.x, d.y, d.fx, d.fy]).toEqual([2.5, 2.5, 0, 1]);
  });

  it('stops against walls and slides along them', () => {
    const c = chef();
    for (let i = 0; i < 60; i++) moveChef(c, { mx: 1, my: 1, dash: false }, K_DT, solid, W, H);
    expect(c.x).toBeCloseTo(W - 1 - CHEF_R, 6);
    expect(c.y).toBeCloseTo(H - 1 - CHEF_R, 6);
  });

  it('dashes forward then cools down', () => {
    const c = chef(1.5, 2.5);
    c.fx = 1;
    c.fy = 0;
    moveChef(c, { mx: 0, my: 0, dash: true }, K_DT, solid, W, H);
    expect(c.x).toBeGreaterThan(1.5 + CHEF_SPEED * K_DT * 2);
    expect(c.dashCd).toBeCloseTo(DASH_COOLDOWN, 6);
    const x = c.x;
    for (let i = 0; i < 10; i++) moveChef(c, idle, K_DT, solid, W, H);
    const after = c.x;
    expect(after).toBeGreaterThan(x); // dash carried on for its remaining time
    moveChef(c, { mx: 0, my: 0, dash: true }, K_DT, solid, W, H);
    expect(c.x).toBe(after); // still cooling down, no stick: no movement
  });

  it('pushes overlapping chefs apart without entering walls', () => {
    const a = { x: 2.5, y: 2.5 };
    const b = { x: 2.6, y: 2.5 };
    for (let i = 0; i < 20; i++) separateChefs([a, b], solid, W, H);
    expect(b.x - a.x).toBeGreaterThan(CHEF_R * 2 - 0.05);
    for (const p of [a, b]) expect(p.x).toBeGreaterThanOrEqual(1 + CHEF_R - 1e-9);
  });
});
