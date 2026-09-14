import { describe, expect, it } from 'vitest';
import { useKitchen } from './store';

describe('useKitchen store', () => {
  it('go() resets stale round state left over from a previous round', () => {
    useKitchen.setState({
      over: true,
      time: 42,
      timeAt: 1000,
      lag: true,
      reconnecting: true,
      phase: 'results',
      roomId: 'r1',
    });
    useKitchen.getState().go('r2');
    const s = useKitchen.getState();
    expect(s.over).toBe(false);
    expect(s.time).toBe(0);
    expect(s.timeAt).toBe(0);
    expect(s.lag).toBe(false);
    expect(s.reconnecting).toBe(false);
    expect(s.phase).toBe('joining');
    expect(s.roomId).toBe('r2');
  });

  it('play again leaves the results and stays pending until the next round starts', () => {
    useKitchen.setState({ phase: 'results', roomId: 'r1', result: { score: 1, stars: 0, served: 1, failed: 0, earned: 0 } });
    useKitchen.getState().playAgain();
    let s = useKitchen.getState();
    expect(s).toMatchObject({ again: true, phase: 'off', roomId: null, result: null });
    useKitchen.getState().go('r3');
    s = useKitchen.getState();
    expect(s.again).toBe(false);
    expect(s.phase).toBe('joining');
    useKitchen.getState().playAgain();
    useKitchen.getState().clearAgain();
    expect(useKitchen.getState().again).toBe(false);
  });
});
