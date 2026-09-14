import { describe, expect, it } from 'vitest';
import { settleOrLog } from './duelSettle';

const input = { aId: 'u1', bId: 'u2', stake: 50, credits: [{ userId: 'u1', amount: 100 }], log: true };

describe('settleOrLog', () => {
  it('returns the result when the first try works', async () => {
    const lines: string[] = [];
    let calls = 0;
    expect(await settleOrLog(async () => (calls++, { u1: 150 }), input, (l) => lines.push(l))).toEqual({ u1: 150 });
    expect(calls).toBe(1);
    expect(lines).toEqual([]);
  });

  it('retries once after a failure', async () => {
    const lines: string[] = [];
    let calls = 0;
    const settle = async () => {
      if (calls++ === 0) throw new Error('db busy');
      return { u1: 150 };
    };
    expect(await settleOrLog(settle, input, (l) => lines.push(l))).toEqual({ u1: 150 });
    expect(calls).toBe(2);
    expect(lines).toEqual([]);
  });

  it('logs the full input as one replayable JSON line when both tries fail', async () => {
    const lines: string[] = [];
    let calls = 0;
    const settle = async (): Promise<Record<string, number>> => {
      calls++;
      throw new Error('disk full');
    };
    expect(await settleOrLog(settle, input, (l) => lines.push(l))).toBeNull();
    expect(calls).toBe(2);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('[duel-settle-failed] ')).toBe(true);
    expect(JSON.parse(lines[0].slice('[duel-settle-failed] '.length))).toEqual({ input, error: 'disk full' });
  });
});
