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
  /** members sent (or queued) into the current round */
  round: string[];
  /** members allowed into the current round (a late "play again" joins it) */
  eligible: string[];
  /** the round that ended last, and who is still on its results screen */
  lastRoom: string | null;
  results: string[];
}

export interface RoundStart {
  pad: number;
  /** who goes in now */
  members: string[];
  /** who may join this round later */
  eligible: string[];
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
      return { pad, code, members: [], phase: 'open', roomId: null, startedAt: 0, round: [], eligible: [], lastRoom: null, results: [] };
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
      c.results = c.results.filter((m) => next.includes(m));
      for (const m of gone) out.push({ type: 'crew', to: m, crew: null });
      out.push(...this.tell(c));
    }
    return out;
  }

  /**
   * "start cooking" (again = false): everyone on the rug except crewmates still reading the last
   * round's results. "play again" (again = true): only the one who asked. While the crew is already
   * cooking, a crewmate allowed in that round joins it (two "play again" presses share one round).
   */
  start(member: string, again = false): RoundStart | CrewEvent[] {
    const c = this.crewOf(member);
    if (!c) return [{ type: 'error', to: member, code: 'not_in_crew' }];
    c.results = c.results.filter((m) => m !== member);
    if (c.phase === 'cooking') {
      // members are frozen while cooking (sync skips), so this only guards against a stale/odd member list
      if (!c.eligible.includes(member)) return [{ type: 'error', to: member, code: 'already_cooking' }];
      if (c.round.includes(member)) return [];
      c.round.push(member);
      // still being created: began() sends everyone in `round` there
      return c.roomId ? [{ type: 'go', to: member, roomId: c.roomId }] : [];
    }
    c.phase = 'cooking';
    c.startedAt = this.now();
    c.roomId = null;
    c.round = again ? [member] : c.members.filter((m) => !c.results.includes(m));
    c.eligible = [...c.members];
    return { pad: c.pad, members: [...c.round], eligible: [...c.eligible] };
  }

  began(pad: number, roomId: string): CrewEvent[] {
    const c = this.crews[pad];
    if (!c) return [];
    c.roomId = roomId;
    return [...c.round.map((m): CrewEvent => ({ type: 'go', to: m, roomId })), ...this.tell(c)];
  }

  /** the round could not be created: tell everyone who was going in, reopen */
  failed(pad: number, code: string): CrewEvent[] {
    const c = this.crews[pad];
    if (!c) return [];
    const going = [...c.round];
    return [...this.finish(pad), ...going.map((m): CrewEvent => ({ type: 'error', to: m, code }))];
  }

  finish(pad: number): CrewEvent[] {
    const c = this.crews[pad];
    if (!c) return [];
    c.phase = 'open';
    c.roomId = null;
    c.round = [];
    c.eligible = [];
    return this.tell(c);
  }

  /** time's up in `roomId`: the crew can start again right away; its cooks are on the results screen */
  ended(roomId: string): CrewEvent[] {
    const c = this.crews.find((x) => x.roomId === roomId);
    if (!c) return [];
    const results = c.round.filter((m) => c.members.includes(m));
    const out = this.finish(c.pad);
    c.lastRoom = roomId;
    c.results = results;
    return out;
  }

  /** `member` left `roomId` (e.g. pressed "back" on the results) */
  left(roomId: string, member: string) {
    for (const c of this.crews) if (c.lastRoom === roomId) c.results = c.results.filter((m) => m !== member);
  }

  /** `roomId` was disposed: a round that never ended reopens its crew; nobody reads its results any more */
  closed(roomId: string): CrewEvent[] {
    const out: CrewEvent[] = [];
    for (const c of this.crews) {
      if (c.lastRoom === roomId) {
        c.lastRoom = null;
        c.results = [];
      }
      if (c.roomId === roomId) out.push(...this.finish(c.pad));
    }
    return out;
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
