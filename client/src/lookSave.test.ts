import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookSaved, markLookSaving, resetLookSave } from './lookSave';
import { goToRoom } from './router';

const assign = vi.fn();
(globalThis as unknown as { location: unknown }).location = { assign, pathname: '/' };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('room navigation waits for a pending look save', () => {
  beforeEach(() => {
    assign.mockReset();
    resetLookSave();
  });
  afterEach(() => vi.useRealTimers());

  it('navigates straight away when nothing is saving', async () => {
    await goToRoom('abcd1234');
    expect(assign).toHaveBeenCalledWith('/r/abcd1234');
  });

  it('holds navigation until the server acks the save', async () => {
    markLookSaving();
    const nav = goToRoom('abcd1234');
    await flush();
    expect(assign).not.toHaveBeenCalled();
    expect(lookSaved()).toBe(true);
    await nav;
    expect(assign).toHaveBeenCalledWith('/r/abcd1234');
  });

  it('waits for every outstanding save, not just the first ack', async () => {
    markLookSaving();
    markLookSaving();
    const nav = goToRoom('abcd1234');
    expect(lookSaved()).toBe(false);
    await flush();
    expect(assign).not.toHaveBeenCalled();
    expect(lookSaved()).toBe(true);
    await nav;
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('gives up waiting after the timeout and navigates anyway', async () => {
    vi.useFakeTimers();
    markLookSaving();
    const nav = goToRoom('abcd1234');
    await vi.advanceTimersByTimeAsync(1000);
    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    await nav;
    expect(assign).toHaveBeenCalledWith('/r/abcd1234');
  });
});
