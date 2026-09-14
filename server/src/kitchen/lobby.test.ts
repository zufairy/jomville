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

describe('KitchenLobby play again', () => {
  const goes = (sent: Array<{ to: string; type: string; data: any }>) => sent.filter((m) => m.type === 'k_go').map((m) => [m.to, m.data.roomId]);
  const errors = (sent: Array<{ to: string; type: string; data: any }>) => sent.filter((m) => m.type === 'sys').map((m) => [m.to, m.data.code]);

  async function afterRound() {
    let n = 0;
    const s = setup(async () => `room-${++n}`);
    s.lobby.tick();
    await s.lobby.start('s1');
    rounds.emit('ended', 'room-1'); // time's up: results on screen, the old room lingers
    s.sent.length = 0;
    return s;
  }

  it('starts a new round right away for whoever chose play again, without the crewmate who pressed back', async () => {
    const { lobby, sent, calls } = await afterRound();
    rounds.emit('left', 'room-1', 'u2'); // bo pressed "back to the kitchen" (still standing on the rug)
    await lobby.again('s1');
    expect(calls).toHaveLength(2); // no waiting for room-1 to dispose
    expect(goes(sent)).toEqual([['s1', 'room-2']]);
    expect(errors(sent)).toEqual([]);
    lobby.dispose();
  });

  it('does not pull a crewmate who is still on the results screen', async () => {
    const { lobby, sent } = await afterRound();
    await lobby.again('s2');
    expect(goes(sent)).toEqual([['s2', 'room-2']]);
    lobby.dispose();
  });

  it('two crewmates pressing play again at once share one round and see no error', async () => {
    const { lobby, sent, calls } = await afterRound();
    await Promise.all([lobby.again('s1'), lobby.again('s2')]);
    expect(calls).toHaveLength(2);
    expect(goes(sent).sort()).toEqual([
      ['s1', 'room-2'],
      ['s2', 'room-2'],
    ]);
    expect(errors(sent)).toEqual([]);
    // allowed in: everyone from the last round, so a later "play again" can still join
    expect((calls[1] as { userIds: string[] }).userIds.sort()).toEqual(['u1', 'u2']);
    lobby.dispose();
  });

  it('a later play again joins the rematch already cooking', async () => {
    const { lobby, sent, calls } = await afterRound();
    await lobby.again('s1');
    await lobby.again('s2');
    expect(calls).toHaveLength(2);
    expect(goes(sent)).toEqual([
      ['s1', 'room-2'],
      ['s2', 'room-2'],
    ]);
    expect(errors(sent)).toEqual([]);
    lobby.dispose();
  });

  it('start cooking from the lobby skips crewmates still reading their results', async () => {
    const { lobby, sent } = await afterRound();
    rounds.emit('left', 'room-1', 'u2');
    await lobby.start('s2');
    expect(goes(sent)).toEqual([['s2', 'room-2']]);
    lobby.dispose();
  });
});
