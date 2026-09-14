import { describe, expect, it, vi } from 'vitest';
import { GestureController } from './gestures';

function cbs() {
  return {
    onPan: vi.fn(),
    onPinch: vi.fn(),
    onFling: vi.fn(),
    onWheelZoom: vi.fn(),
  };
}

describe('GestureController tap vs drag', () => {
  it('treats a 7px total move as a tap (no pan, consumeTap false)', () => {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.down({ pointerId: 1, x: 0, y: 0, t: 0 });
    g.move({ pointerId: 1, x: 7, y: 0, t: 10 });
    g.up({ pointerId: 1, x: 7, y: 0, t: 20 });
    expect(callbacks.onPan).not.toHaveBeenCalled();
    expect(g.consumeTap()).toBe(false);
  });

  it('treats a 9px total move as a drag (pan fires, consumeTap true)', () => {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.down({ pointerId: 1, x: 0, y: 0, t: 0 });
    g.move({ pointerId: 1, x: 9, y: 0, t: 10 });
    g.up({ pointerId: 1, x: 9, y: 0, t: 20 });
    expect(callbacks.onPan).toHaveBeenCalledWith(9, 0);
    expect(g.consumeTap()).toBe(true);
  });

  it('consumeTap resets after reading', () => {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.down({ pointerId: 1, x: 0, y: 0, t: 0 });
    g.move({ pointerId: 1, x: 20, y: 0, t: 10 });
    g.up({ pointerId: 1, x: 20, y: 0, t: 20 });
    expect(g.consumeTap()).toBe(true);
    expect(g.consumeTap()).toBe(false);
  });
});

describe('GestureController pinch', () => {
  // two fingers start 100px apart (midpoint at x=50); a no-op move seeds the
  // baseline distance/midpoint, then a real move changes both.
  function pinchSetup() {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.down({ pointerId: 1, x: 0, y: 0, t: 0 });
    g.down({ pointerId: 2, x: 100, y: 0, t: 0 });
    g.move({ pointerId: 1, x: 0, y: 0, t: 5 }); // seeds baseline dist=100, mid=(50,0)
    return { callbacks, g };
  }

  it('reports scale factor and midpoint, and pans by midpoint movement', () => {
    const { callbacks, g } = pinchSetup();
    // spread to 300px apart -> dist 300, mid (150,0); baseline was dist 100, mid (50,0)
    g.move({ pointerId: 2, x: 300, y: 0, t: 15 });
    expect(callbacks.onPan).toHaveBeenCalledWith(100, 0);
    expect(callbacks.onPinch).toHaveBeenCalledWith(3, 150, 0);
  });

  it('marks the sequence as consumable (not a tap) after a pinch', () => {
    const { callbacks, g } = pinchSetup();
    g.move({ pointerId: 2, x: 300, y: 0, t: 15 });
    g.up({ pointerId: 1, x: 0, y: 0, t: 20 });
    g.up({ pointerId: 2, x: 300, y: 0, t: 20 });
    expect(g.consumeTap()).toBe(true);
    // a pinch release should not also fire a fling
    expect(callbacks.onFling).not.toHaveBeenCalled();
  });
});

describe('GestureController wheel', () => {
  it('zooms in (factor > 1) on negative deltaY', () => {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.wheel({ deltaY: -100, x: 5, y: 6 });
    expect(callbacks.onWheelZoom).toHaveBeenCalled();
    const [factor, x, y] = callbacks.onWheelZoom.mock.calls[0];
    expect(factor).toBeGreaterThan(1);
    expect(x).toBe(5);
    expect(y).toBe(6);
  });

  it('zooms out (factor < 1) on positive deltaY', () => {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.wheel({ deltaY: 100, x: 0, y: 0 });
    const [factor] = callbacks.onWheelZoom.mock.calls[0];
    expect(factor).toBeLessThan(1);
  });
});

describe('GestureController fling', () => {
  it('computes velocity from the last ~100ms of moves on release', () => {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.down({ pointerId: 1, x: 0, y: 0, t: 0 });
    // old, far-outside-the-window sample: should be excluded from velocity calc
    g.move({ pointerId: 1, x: 5, y: 0, t: 5 });
    // recent samples within the 100ms window
    g.move({ pointerId: 1, x: 50, y: 0, t: 200 });
    g.move({ pointerId: 1, x: 100, y: 20, t: 260 });
    g.up({ pointerId: 1, x: 100, y: 20, t: 260 });
    expect(callbacks.onFling).toHaveBeenCalledTimes(1);
    const [vx, vy] = callbacks.onFling.mock.calls[0];
    // from t=200 (x=50) to t=260 (x=100,y=20): vx = 50/60, vy = 20/60
    expect(vx).toBeCloseTo(50 / 60, 3);
    expect(vy).toBeCloseTo(20 / 60, 3);
  });

  it('does not fling on a plain tap', () => {
    const callbacks = cbs();
    const g = new GestureController(callbacks);
    g.down({ pointerId: 1, x: 0, y: 0, t: 0 });
    g.up({ pointerId: 1, x: 0, y: 0, t: 5 });
    expect(callbacks.onFling).not.toHaveBeenCalled();
  });
});
