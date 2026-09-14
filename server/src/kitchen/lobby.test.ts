import { describe, expect, it } from 'vitest';
import { padTiles } from '@dovey/shared';
import { KitchenLobby, LobbyPlayer } from './lobby';
import { rounds } from './rounds';

function setup(create: () => Promise<string> = async () => 'room-1') {
  const sent: Array<{ to: string; type: string; data: any }> = [];
  const walks: Array<[string, number, number]> = [];
  const [x0, y0] = padTiles(0)[0];
  const players: LobbyPlayer[] = [
    { sessionId: 's1', userId: 'u1', handle: 'ann', x: x0, y: y0, moving: false },
    { sessionId: 's2', userId: 'u2', handle: 'bo', x: x0 + 1, y: y0, moving: false },
    { sessionId: 's3', userId: 'u3', handle: 'cy', x: 7, y: 7, moving: false },
  ];
  const calls: unknown[] = [];
  const lobby = new KitchenLobby(
    { players: () => players, send: (to, type, data) => sent.push({ to, type, data }), walkTo: (id, x, y) => walks.push([id, x, y]) },
    async (o) => {
      calls.push(o);
      return create();
    },
  );
  return { lobby, sent, walks, calls };
}

describe('KitchenLobby', () => {
  it('announces crews with handles and starts a round for their users', async () => {
    const { lobby, sent, calls } = setup();
    lobby.tick();
    expect(sent.find((m) => m.to === 's1' && m.type === 'k_crew')?.data.crew).toMatchObject({ pad: 0, members: ['s1', 's2'], names: ['ann', 'bo'] });
    await lobby.start('s1');
    expect(calls[0]).toMatchObject({ level: 'diner', userIds: ['u1', 'u2'] });
    expect(sent.filter((m) => m.type === 'k_go').map((m) => [m.to, m.data.roomId])).toEqual([
      ['s1', 'room-1'],
      ['s2', 'room-1'],
    ]);
    rounds.emit('done', 'room-1');
    expect(sent.at(-1)).toMatchObject({ type: 'k_crew', data: { crew: { phase: 'open' } } });
    lobby.dispose();
  });

  it('reports a failed room and reopens the crew', async () => {
    const { lobby, sent } = setup(async () => {
      throw new Error('boom');
    });
    lobby.tick();
    await lobby.start('s2');
    expect(sent.filter((m) => m.type === 'sys').map((m) => m.data.code)).toEqual(['kitchen_failed', 'kitchen_failed']);
    lobby.dispose();
  });

  it('walks a player to a free rug tile for a crew code, rejects bad codes', () => {
    const { lobby, sent, walks } = setup();
    lobby.join('s3', lobby.book.codeOf(0));
    expect(walks).toEqual([['s3', ...padTiles(0)[2]]]);
    lobby.join('s3', 'nope');
    expect(sent.at(-1)).toEqual({ to: 's3', type: 'sys', data: { code: 'bad_code' } });
    lobby.dispose();
  });
});
