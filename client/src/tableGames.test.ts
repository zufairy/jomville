import { beforeEach, describe, expect, it } from 'vitest';
import { TableState } from '@dovey/shared';
import { onTableState, useTables } from './tableGames';

const base = {
  id: 'm1',
  kind: 'ttt' as const,
  you: 0 as const,
  names: ['me', 'mia'] as [string, string],
  seats: ['s-me', 's-mia'] as [string, string],
  state: {} as TableState,
  turnLeft: 10_000,
  rematch: [false, false] as [boolean, boolean],
  bot: false,
  round: 1,
  over: false,
  table: null,
};

describe('table store', () => {
  beforeEach(() => useTables.getState().reset());

  it('keeps seat session ids from the server', () => {
    onTableState(base);
    expect(useTables.getState().match?.seats).toEqual(['s-me', 's-mia']);
    expect(useTables.getState().phase).toBe('playing');
  });
});
