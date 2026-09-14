import { describe, expect, it, vi } from 'vitest';
import { BotCrew, PERSONAS, pickResponder } from './bots';
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

  it('spawn info is deterministic per persona', () => {
    expect(BotCrew.spawnInfo(PERSONAS[0])).toEqual(BotCrew.spawnInfo(PERSONAS[0]));
    expect(BotCrew.spawnInfo(PERSONAS[0]).avatar).not.toBe(BotCrew.spawnInfo(PERSONAS[1]).avatar);
  });
});
