import { describe, expect, it, vi } from 'vitest';
import { BotCrew, PERSONAS, pickResponder, scatterSpawns } from './bots';
import { makeGrid } from '@dovey/shared';

describe('lobby bots', () => {
  it('picks the named bot, else the nearest within earshot', () => {
    const list = PERSONAS.slice(0, 2).map((p, i) => ({ p, pos: { x: i * 10, y: 0 } }));
    expect(pickResponder('eh Nurul makan apa', { x: 0, y: 0 }, list)?.name).toBe('Nurul');
    expect(pickResponder('hello', { x: 1, y: 0 }, list)?.name).toBe('Aiman');
    expect(pickResponder('hello', { x: 5, y: 5 }, list)).toBeNull();
  });

  it('replies through the model with memory, falls back to canned lines', async () => {
    vi.useFakeTimers();
    const said: Array<[string, string]> = [];
    const llm = vi.fn(async (m: Array<{ role: string; content: string }>) => (m.length > 2 ? '' : 'Aiman: hi hi bro'));
    const crew = new BotCrew(
      {
        grid: () => makeGrid(10, 10),
        seats: () => [],
        humans: () => [{ id: 'h1', handle: 'ali', x: 1, y: 1 }],
        mover: () => ({ x: 1, y: 2, moving: false }),
        requestMove: () => true,
        say: (id, t) => said.push([id, t]),
        emote: () => {},
        llm,
        rand: () => 0.1,
      },
      PERSONAS.slice(0, 1),
    );
    crew.onHumanChat({ id: 'h1', handle: 'ali', x: 1, y: 1 }, 'hello');
    await vi.runAllTimersAsync();
    expect(said[0]).toEqual(['bot:aiman', 'hi hi bro']); // name prefix stripped
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0][0][0].content).toContain('Aiman');
    // second line: cooldown passed (fake time advanced), model returns '' -> canned
    vi.setSystemTime(Date.now() + 10_000);
    crew.onHumanChat({ id: 'h1', handle: 'ali', x: 1, y: 1 }, 'again');
    await vi.runAllTimersAsync();
    expect(said.length).toBe(2);
    expect(PERSONAS[0].lines).toContain(said[1][1]);
    expect(llm.mock.calls[1][0].length).toBe(4); // system + user + assistant + user
    vi.useRealTimers();
  });

  it('scatters spawn tiles across the map, away from the centre, seats and each other', () => {
    const grid = makeGrid(30, 30);
    const center = { x: 15, y: 15 };
    const seats = new Set(['3,3', '26,26']);
    let s = 7;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
    const tiles = scatterSpawns(grid, 5, { center, clearRadius: 4, avoid: seats, minGap: 5 }, rand);
    expect(tiles).toHaveLength(5);
    const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
    expect(keys.size).toBe(5);
    for (const t of tiles) {
      expect(grid.walkable[t.y][t.x]).toBe(true);
      expect(Math.abs(t.x - center.x) + Math.abs(t.y - center.y)).toBeGreaterThan(4);
      expect(seats.has(`${t.x},${t.y}`)).toBe(false);
    }
    for (const a of tiles) for (const b of tiles) if (a !== b) expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(5);
  });

  it('still returns walkable tiles when the map is too small to keep them apart', () => {
    const grid = makeGrid(6, 6);
    const tiles = scatterSpawns(grid, 5, { center: { x: 3, y: 3 }, clearRadius: 1, avoid: new Set(), minGap: 5 }, () => 0.5);
    expect(tiles).toHaveLength(5);
    for (const t of tiles) expect(grid.walkable[t.y][t.x]).toBe(true);
    expect(new Set(tiles.map((t) => `${t.x},${t.y}`)).size).toBe(5);
  });

  it('spawn info is deterministic per persona', () => {
    expect(BotCrew.spawnInfo(PERSONAS[0])).toEqual(BotCrew.spawnInfo(PERSONAS[0]));
    expect(BotCrew.spawnInfo(PERSONAS[0]).avatar).not.toBe(BotCrew.spawnInfo(PERSONAS[1]).avatar);
  });
});
