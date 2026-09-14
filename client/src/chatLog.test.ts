import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';

describe('chat log ring buffer', () => {
  beforeEach(() => useAppStore.setState({ chatLog: [] }));

  it('appends newest-last', () => {
    useAppStore.getState().pushChat({ id: 'a', name: 'mia', text: 'hi', roll: false, at: 1 });
    useAppStore.getState().pushChat({ id: 'a', name: 'mia', text: 'there', roll: false, at: 2 });
    const log = useAppStore.getState().chatLog;
    expect(log.map((l) => l.text)).toEqual(['hi', 'there']);
  });

  it('caps at 30 entries, dropping the oldest', () => {
    for (let i = 0; i < 35; i++) {
      useAppStore.getState().pushChat({ id: 'a', name: 'mia', text: `m${i}`, roll: false, at: i });
    }
    const log = useAppStore.getState().chatLog;
    expect(log.length).toBe(30);
    expect(log[0].text).toBe('m5');
    expect(log[log.length - 1].text).toBe('m34');
  });

  it('assigns each line a unique, increasing key', () => {
    useAppStore.getState().pushChat({ id: 'a', name: 'mia', text: 'one', roll: false, at: 1 });
    useAppStore.getState().pushChat({ id: 'a', name: 'mia', text: 'two', roll: false, at: 2 });
    const [first, second] = useAppStore.getState().chatLog;
    expect(second.key).toBeGreaterThan(first.key);
  });
});
