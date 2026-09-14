import { describe, expect, it } from 'vitest';
import { SKIN_TONES, kitchen, normalizeAvatar, parseAvatar, serializeAvatar } from '@dovey/shared';
import type { User } from '../repo';
import { KitchenRoom } from './KitchenRoom';

type Sent = { to: string; type: string; data: any };

/** a KitchenRoom without the matchmaker: just the join path and what it sends */
function room() {
  const r = new KitchenRoom();
  const sent: Sent[] = [];
  (r as any).sim = kitchen.createKitchen('diner', 1, []);
  (r as any).broadcast = (type: string, data: unknown) => sent.push({ to: '*', type, data });
  const join = (user: User) => {
    const client: any = { sessionId: `s-${user.id}`, auth: user, send: (type: string, data: unknown) => sent.push({ to: user.id, type, data }) };
    r.onJoin(client, {}, user);
    return client;
  };
  return { r, sent, join };
}

const user = (id: string, handle: string, body: string, skin: number): User =>
  ({ id, handle, avatar: normalizeAvatar({ body, skin: SKIN_TONES[skin] }), onboarded: true, linked: false }) as unknown as User;

describe('KitchenRoom chef looks', () => {
  it('sends every chef its stored avatar on join (hello + roster), never in snapshots', () => {
    const { sent, join } = room();
    const ann = user('u1', 'ann', 'female', 2);
    const bo = user('u2', 'bo', 'male', 1);
    expect(serializeAvatar(ann.avatar)).not.toBe(serializeAvatar(bo.avatar));
    join(ann);
    join(bo);
    const hello = sent.find((m) => m.to === 'u2' && m.type === 'k_hello')!.data;
    expect(Object.keys(hello.looks).sort()).toEqual(['u1', 'u2']);
    expect(parseAvatar(hello.looks.u1)).toEqual(ann.avatar);
    expect(hello.looks.u2).toBe(serializeAvatar(bo.avatar));
    const roster = sent.filter((m) => m.type === 'k_roster').at(-1)!.data;
    expect(parseAvatar(roster.looks.u2)).toEqual(bo.avatar);
    for (const m of sent.filter((x) => x.type === 'k_snap')) expect(JSON.stringify(m.data)).not.toContain('hairColour');
  });

  it('normalizes a malformed stored avatar instead of forwarding it', () => {
    const { sent, join } = room();
    join({ id: 'u9', handle: 'zed', avatar: { hair: '<script>', torso: 42 } } as unknown as User);
    const look = sent.find((m) => m.type === 'k_hello')!.data.looks.u9;
    expect(look).toBe(serializeAvatar(normalizeAvatar({ hair: '<script>', torso: 42 })));
  });
});
