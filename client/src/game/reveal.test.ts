import { describe, expect, it } from 'vitest';
import {
  PIECE_MS,
  PIECE_SCALE_FROM,
  REVEAL_TIMEOUT_MS,
  RevealGate,
  STAGGER_CAP_MS,
  pieceScale,
  pieceProgress,
  revealOrder,
  staggerDelay,
  staggerTotal,
} from './reveal';

describe('reveal stagger', () => {
  it('spaces a few pieces by the normal step', () => {
    expect(staggerDelay(0, 3)).toBe(0);
    expect(staggerDelay(1, 3)).toBe(45);
    expect(staggerDelay(2, 3)).toBe(90);
  });

  it('squeezes many pieces so the last one starts by the cap', () => {
    const n = 200;
    expect(staggerDelay(n - 1, n)).toBeCloseTo(STAGGER_CAP_MS);
    for (let i = 1; i < n; i++) expect(staggerDelay(i, n)).toBeGreaterThanOrEqual(staggerDelay(i - 1, n));
    expect(staggerTotal(n)).toBeCloseTo(STAGGER_CAP_MS + PIECE_MS);
  });

  it('a single piece or an empty room has no stagger', () => {
    expect(staggerDelay(0, 1)).toBe(0);
    expect(staggerTotal(0)).toBe(0);
    expect(staggerTotal(1)).toBe(PIECE_MS);
  });

  it('progress eases from 0 to 1 over the piece duration', () => {
    expect(pieceProgress(50, 100)).toBe(0);
    expect(pieceProgress(100 + PIECE_MS, 100)).toBe(1);
    const mid = pieceProgress(100 + PIECE_MS / 2, 100);
    // ease-out: past halfway at half time
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });

  it('pieces grow from 0.9 unless motion is reduced', () => {
    expect(pieceScale(0, false)).toBe(PIECE_SCALE_FROM);
    expect(pieceScale(1, false)).toBe(1);
    expect(pieceScale(0, true)).toBe(1);
  });
});

describe('revealOrder', () => {
  it('goes bottom to top by iso depth, ties by id', () => {
    const out = revealOrder([
      { id: 'c', depth: 5 },
      { id: 'b', depth: -1000 },
      { id: 'a', depth: 5 },
      { id: 'd', depth: 2 },
    ]);
    expect(out.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('RevealGate', () => {
  it('waits for both the join and the first state sync', () => {
    const g = new RevealGate();
    g.begin(0);
    expect(g.inputOpen).toBe(false);
    g.markJoined();
    expect(g.ready(100)).toBe(false);
    g.markSynced();
    expect(g.ready(100)).toBe(true);
  });

  it('reveals anyway after the safety timeout', () => {
    const g = new RevealGate();
    g.begin(1000);
    expect(g.ready(1000 + REVEAL_TIMEOUT_MS - 1)).toBe(false);
    expect(g.ready(1000 + REVEAL_TIMEOUT_MS)).toBe(true);
  });

  it('opens input when the reveal starts and settles after its duration', () => {
    const g = new RevealGate();
    g.begin(0);
    g.markJoined();
    g.markSynced();
    g.start(200, 600);
    expect(g.inputOpen).toBe(true);
    expect(g.ready(300)).toBe(false);
    expect(g.elapsed(500)).toBe(300);
    expect(g.settle(700)).toBe(false);
    expect(g.settle(800)).toBe(true);
    expect(g.phase).toBe('shown');
    expect(g.settle(900)).toBe(false);
  });

  it('a new begin forgets the previous load', () => {
    const g = new RevealGate();
    g.begin(0);
    g.markJoined();
    g.markSynced();
    g.begin(10);
    expect(g.ready(20)).toBe(false);
  });
});
