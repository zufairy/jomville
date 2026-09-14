import { describe, expect, it } from 'vitest';
import { COUNT_UP_MS, REVEAL_MS, RevealCue, RevealRunner, countUp, cuesBetween, pickRingMs, revealFrame } from './useDuelTimeline';

describe('reveal timeline', () => {
  it('lasts 1.8 s', () => {
    expect(REVEAL_MS).toBe(1800);
  });

  it('phases start and end on the approved beats', () => {
    expect(revealFrame(-5)).toEqual({ phase: 'count', progress: 0, beat: 0 });
    expect(revealFrame(0)).toEqual({ phase: 'count', progress: 0, beat: 0 });
    expect(revealFrame(199).beat).toBe(0);
    expect(revealFrame(200).beat).toBe(1);
    expect(revealFrame(400).beat).toBe(2);
    expect(revealFrame(599)).toMatchObject({ phase: 'count', beat: 2 });
    expect(revealFrame(600)).toEqual({ phase: 'shoot', progress: 0, beat: null });
    expect(revealFrame(725)).toEqual({ phase: 'shoot', progress: 0.5, beat: null });
    expect(revealFrame(850).phase).toBe('clash');
    expect(revealFrame(1050).phase).toBe('resolve');
    expect(revealFrame(1650).phase).toBe('settle');
    expect(revealFrame(1799).phase).toBe('settle');
    expect(revealFrame(1800)).toEqual({ phase: 'done', progress: 1, beat: null });
  });

  it('cues fall in (prev, now]', () => {
    expect(cuesBetween(-1, 0)).toEqual(['tick0']);
    expect(cuesBetween(0, 0)).toEqual([]);
    expect(cuesBetween(0, 600)).toEqual(['tick1', 'tick2', 'shoot']);
    expect(cuesBetween(600, 1800)).toEqual(['clash', 'result', 'done']);
  });

  it('the runner fires each cue once, in order, then done once (fake clock)', () => {
    let clock = 1000;
    const start = clock;
    const cues: RevealCue[] = [];
    let done = 0;
    const run = new RevealRunner({ onCue: (c) => cues.push(c), onDone: () => done++ });
    run.advance(clock - start);
    expect(cues).toEqual(['tick0']);
    clock += 250;
    run.advance(clock - start);
    run.advance(clock - start); // same instant again: nothing new
    expect(cues).toEqual(['tick0', 'tick1']);
    clock += 850;
    expect(run.advance(clock - start).phase).toBe('resolve');
    expect(cues).toEqual(['tick0', 'tick1', 'tick2', 'shoot', 'clash', 'result']);
    expect(done).toBe(0);
    expect(run.done).toBe(false);
    clock += 700;
    expect(run.advance(clock - start).phase).toBe('done');
    expect(done).toBe(1);
    expect(run.done).toBe(true);
    clock += 5000;
    run.advance(clock - start);
    expect(done).toBe(1);
    expect(cues).toHaveLength(6);
  });

  it('a tab that wakes up late plays every missed cue then finishes', () => {
    const cues: RevealCue[] = [];
    let done = 0;
    const run = new RevealRunner({ onCue: (c) => cues.push(c), onDone: () => done++ });
    run.advance(9000);
    expect(cues).toEqual(['tick0', 'tick1', 'tick2', 'shoot', 'clash', 'result']);
    expect(done).toBe(1);
  });

  it('the coin counter eases up to the total', () => {
    expect(COUNT_UP_MS).toBe(1200);
    expect(countUp(0, 100)).toBe(0);
    expect(countUp(600, 100)).toBe(88); // ease-out cubic: 1 - 0.5^3
    expect(countUp(1200, 100)).toBe(100);
    expect(countUp(5000, 100)).toBe(100);
    expect(countUp(600, 0)).toBe(0);
    const steps = [0, 100, 300, 700, 1100, 1200].map((t) => countUp(t, 1000));
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('later rounds lose the reveal from the 20 s pick ring', () => {
    expect(pickRingMs(1)).toBe(20_000);
    expect(pickRingMs(2)).toBe(18_200);
    expect(pickRingMs(6)).toBe(18_200);
  });
});
