import { describe, expect, it } from 'vitest';
import { ARRIVAL_WAIT_MS, arrivalReady } from './useArrival';

describe('walk-up use arrival', () => {
  const here = { x: 4, y: 5 };
  it('waits while the server still has us walking or elsewhere', () => {
    expect(arrivalReady(here, { x: 3, y: 5, moving: true }, 0)).toBe(false);
    expect(arrivalReady(here, { x: 3.2, y: 5, moving: false }, 200)).toBe(false);
    expect(arrivalReady(here, { x: 4, y: 5, moving: true }, 200)).toBe(false);
  });
  it('fires once the server agrees we stand on the tile', () => {
    expect(arrivalReady(here, { x: 4.1, y: 4.9, moving: false }, 50)).toBe(true);
  });
  it('gives up waiting after the grace period or without server state', () => {
    expect(arrivalReady(here, { x: 1, y: 1, moving: true }, ARRIVAL_WAIT_MS)).toBe(true);
    expect(arrivalReady(here, null, 0)).toBe(true);
  });
});
