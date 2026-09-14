import { describe, expect, it } from 'vitest';
import { humanCount, registry } from './registry';

describe('humanCount', () => {
  const isBot = (id: string) => id.startsWith('bot:');

  it('counts only ids that are not bots', () => {
    expect(humanCount(['s1', 'bot:aiman', 's2', 'bot:nurul'], isBot)).toBe(2);
  });

  it('is zero for an empty room or a room of only bots', () => {
    expect(humanCount([], isBot)).toBe(0);
    expect(humanCount(['bot:aiman', 'bot:farhan'], isBot)).toBe(0);
  });

  it('accepts any iterable, like a map of players keyed by id', () => {
    const players = new Map([
      ['s1', {}],
      ['bot:hafiz', {}],
    ]);
    expect(humanCount(players.keys(), isBot)).toBe(1);
  });

  it('a bots-only room drops out of the registry', () => {
    registry.set('botpark', humanCount(['bot:aiman'], isBot));
    expect(registry.get('botpark')).toBe(0);
    expect(registry.populated().some((r) => r.slug === 'botpark')).toBe(false);
  });
});
