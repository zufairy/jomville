import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, MAX_SHAKE, Particle, addShake, burstConfetti, burstSparks, coinShower, createFx, shakeOffset, stepFx } from './duelFx';

const fixed = (v: number) => () => v;
const part = (o: Partial<Particle>): Particle => ({ kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, size: 3, color: '#fff', life: 0, ttl: 1, ...o });

describe('duel particles', () => {
  it('sparks burst from the impact point', () => {
    const s = createFx();
    burstSparks(s, 100, 50, fixed(0.5), 10);
    expect(s.parts).toHaveLength(10);
    for (const p of s.parts) expect(p).toMatchObject({ kind: 'spark', x: 100, y: 50, life: 0 });
  });

  it('confetti starts above the top edge and coins fly upward', () => {
    const s = createFx();
    burstConfetti(s, 400, fixed(0.5), 5);
    coinShower(s, 200, 300, fixed(0.5), 5);
    expect(s.parts.filter((p) => p.kind === 'confetti').every((p) => p.y < 0 && p.x === 200)).toBe(true);
    expect(s.parts.filter((p) => p.kind === 'coin').every((p) => p.vy < 0)).toBe(true);
  });

  it('a step moves by velocity, gravity pulls down and drag slows', () => {
    const s = createFx();
    s.parts.push(part({ kind: 'coin', vx: 100, vy: 0 }));
    stepFx(s, 0.02);
    const p = s.parts[0];
    // vy += 1300*0.02 = 26, then drag exp(-0.4*0.02): vx 99.20, vy 25.79
    expect(p.vx).toBeCloseTo(99.2, 1);
    expect(p.vy).toBeCloseTo(25.79, 1);
    expect(p.x).toBeCloseTo(1.984, 2);
    expect(p.y).toBeGreaterThan(0);
    expect(p.life).toBeCloseTo(0.02, 5);
  });

  it('sparks point along their flight', () => {
    const s = createFx();
    s.parts.push(part({ kind: 'spark', vx: 0, vy: -200 }));
    stepFx(s, 0.01);
    expect(s.parts[0].rot).toBeCloseTo(Math.atan2(s.parts[0].vy, s.parts[0].vx), 5);
  });

  it('particles die at their ttl', () => {
    const s = createFx();
    s.parts.push(part({ ttl: 0.08 }));
    stepFx(s, 0.05);
    expect(s.parts).toHaveLength(1);
    stepFx(s, 0.05);
    expect(s.parts).toHaveLength(0);
  });

  it('a long frame hitch advances at most 50 ms', () => {
    const s = createFx();
    s.parts.push(part({ kind: 'confetti', vx: 100, ttl: 10 }));
    stepFx(s, 1);
    expect(s.parts[0].life).toBeCloseTo(0.05, 5);
    expect(s.parts[0].x).toBeLessThan(6);
  });

  it('never holds more than the cap', () => {
    const s = createFx();
    burstConfetti(s, 400, Math.random, 1000);
    expect(s.parts).toHaveLength(MAX_PARTICLES);
  });

  it('shake is capped, jitters within its size and decays to rest', () => {
    const s = createFx();
    addShake(s, 30);
    expect(s.shake).toBe(MAX_SHAKE);
    expect(shakeOffset(s, fixed(1))).toEqual({ x: MAX_SHAKE, y: MAX_SHAKE });
    for (let i = 0; i < 40; i++) stepFx(s, 0.05);
    expect(s.shake).toBe(0);
    expect(shakeOffset(s, fixed(1))).toEqual({ x: 0, y: 0 });
  });
});
