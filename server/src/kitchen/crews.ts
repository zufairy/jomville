import { KITCHEN_PADS, kitchen } from '@dovey/shared';

/**
 * Crews in the Kitchen world: whoever stands on a rug is in that rug's crew.
 * Pure bookkeeping with an injectable clock (like TableBook); KitchenLobby
 * turns the events into messages and creates the kitchen rooms.
 */

export type CrewPhase = 'open' | 'cooking';

export interface CrewView {
  pad: number;
  code: string;
  members: string[];
  phase: CrewPhase;
}

export type CrewEvent =
  | { type: 'crew'; to: string; crew: CrewView | null }
  | { type: 'go'; to: string; roomId: string }
  | { type: 'error'; to: string; code: string };

interface Crew extends CrewView {
  roomId: string | null;
  startedAt: number;
}

/** a round plus results screen; after this a crew that never reported back reopens */
export const COOKING_TIMEOUT_MS = (kitchen.ROUND_TIME + 90) * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export class CrewBook {
  private crews: Crew[];

  constructor(
    private now: () => number = Date.now,
    rand: () => number = Math.random,
    pads = KITCHEN_PADS.length,
  ) {
    const used = new Set<string>();
    this.crews = Array.from({ length: pads }, (_, pad) => {
      let code = '';
      do code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('');
      while (used.has(code));
      used.add(code);
      return { pad, code, members: [], phase: 'open', roomId: null, startedAt: 0 };
    });
  }

  codeOf(pad: number): string {
    return this.crews[pad]?.code ?? '';
  }

  padForCode(code: string): number {
    const c = code.trim().toUpperCase();
    return this.crews.findIndex((x) => x.code === c);
  }

  padForRoom(roomId: string): number {
    return this.crews.findIndex((x) => x.roomId === roomId);
  }

  /** who stands on each pad right now (session ids, per pad index) */
  sync(onPads: string[][]): CrewEvent[] {
    const out: CrewEvent[] = [];
    for (const c of this.crews) {
      if (c.phase === 'cooking') {
        if (this.now() - c.startedAt <= COOKING_TIMEOUT_MS) continue;
        out.push(...this.finish(c.pad));
      }
      const here = onPads[c.pad] ?? [];
      const next = [...c.members.filter((m) => here.includes(m)), ...here.filter((m) => !c.members.includes(m))].slice(0, kitchen.CREW_MAX);
      if (same(next, c.members)) continue;
      const gone = c.members.filter((m) => !next.includes(m));
      c.members = next;
      for (const m of gone) out.push({ type: 'crew', to: m, crew: null });
      out.push(...this.tell(c));
    }
    return out;
  }

  start(member: string): { pad: number; members: string[] } | CrewEvent[] {
    const c = this.crewOf(member);
    if (!c) return [{ type: 'error', to: member, code: 'not_in_crew' }];
    if (c.phase === 'cooking') return [{ type: 'error', to: member, code: 'already_cooking' }];
    c.phase = 'cooking';
    c.startedAt = this.now();
    c.roomId = null;
    return { pad: c.pad, members: [...c.members] };
  }

  began(pad: number, roomId: string): CrewEvent[] {
    const c = this.crews[pad];
    if (!c) return [];
    c.roomId = roomId;
    return [...c.members.map((m): CrewEvent => ({ type: 'go', to: m, roomId })), ...this.tell(c)];
  }

  finish(pad: number): CrewEvent[] {
    const c = this.crews[pad];
    if (!c) return [];
    c.phase = 'open';
    c.roomId = null;
    return this.tell(c);
  }

  leave(member: string): CrewEvent[] {
    const c = this.crewOf(member);
    if (!c) return [];
    c.members = c.members.filter((m) => m !== member);
    return this.tell(c);
  }

  private crewOf(member: string): Crew | undefined {
    return this.crews.find((c) => c.members.includes(member));
  }

  private tell(c: Crew): CrewEvent[] {
    const view: CrewView = { pad: c.pad, code: c.code, members: [...c.members], phase: c.phase };
    return c.members.map((m) => ({ type: 'crew', to: m, crew: view }));
  }
}
