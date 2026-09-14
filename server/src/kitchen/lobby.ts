import { KITCHEN_PADS, padAt, padTiles } from '@dovey/shared';
import { CrewBook, CrewEvent } from './crews';
import { rounds } from './rounds';

export interface LobbyPlayer {
  sessionId: string;
  userId: string;
  handle: string;
  x: number;
  y: number;
  moving: boolean;
}

export interface LobbyHost {
  players(): LobbyPlayer[];
  send(sessionId: string, type: string, data: unknown): void;
  walkTo(sessionId: string, x: number, y: number): void;
}

export type CreateRound = (o: { level: string; seed: number; userIds: string[]; roundTime?: number }) => Promise<string>;

/** Test/smoke override: KITCHEN_ROUND_SECONDS=60 shortens rounds. */
function roundSeconds(): number | undefined {
  const n = Number(process.env.KITCHEN_ROUND_SECONDS);
  return Number.isFinite(n) && n >= 10 ? n : undefined;
}

/** Kitchen world glue: rugs -> crews -> kitchen rooms. GameRoom owns one when its slug is the Kitchen. */
export class KitchenLobby {
  private onDone = (roomId: string) => {
    const pad = this.book.padForRoom(roomId);
    if (pad >= 0) this.dispatch(this.book.finish(pad));
  };

  constructor(
    private host: LobbyHost,
    private createRound: CreateRound,
    readonly book = new CrewBook(),
  ) {
    rounds.on('done', this.onDone);
  }

  tick() {
    const onPads: string[][] = KITCHEN_PADS.map(() => []);
    for (const p of this.host.players()) {
      if (p.moving) continue;
      const pad = padAt(Math.round(p.x), Math.round(p.y));
      if (pad >= 0) onPads[pad].push(p.sessionId);
    }
    this.dispatch(this.book.sync(onPads));
  }

  async start(sessionId: string) {
    const r = this.book.start(sessionId);
    if (Array.isArray(r)) return this.dispatch(r);
    const byId = new Map(this.host.players().map((p) => [p.sessionId, p]));
    const userIds = [...new Set(r.members.map((m) => byId.get(m)?.userId).filter((u): u is string => !!u))];
    try {
      const roomId = await this.createRound({ level: 'diner', seed: Math.floor(Math.random() * 2 ** 31), userIds, roundTime: roundSeconds() });
      this.dispatch(this.book.began(r.pad, roomId));
    } catch (e) {
      console.error('[kitchen] could not create round', e);
      this.dispatch([...this.book.finish(r.pad), ...r.members.map((m): CrewEvent => ({ type: 'error', to: m, code: 'kitchen_failed' }))]);
    }
  }

  /** crew code: walk to a free tile on that crew's rug */
  join(sessionId: string, code: unknown) {
    const pad = this.book.padForCode(String(code ?? ''));
    if (pad < 0) return this.dispatch([{ type: 'error', to: sessionId, code: 'bad_code' }]);
    const taken = new Set(
      this.host
        .players()
        .filter((p) => p.sessionId !== sessionId)
        .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`),
    );
    const tiles = padTiles(pad);
    const [x, y] = tiles.find(([tx, ty]) => !taken.has(`${tx},${ty}`)) ?? tiles[0];
    this.host.walkTo(sessionId, x, y);
  }

  leave(sessionId: string) {
    this.dispatch(this.book.leave(sessionId));
  }

  dispose() {
    rounds.off('done', this.onDone);
  }

  private dispatch(events: CrewEvent[]) {
    if (!events.length) return;
    const names = new Map(this.host.players().map((p) => [p.sessionId, p.handle]));
    for (const e of events) {
      if (e.type === 'crew') this.host.send(e.to, 'k_crew', { crew: e.crew && { ...e.crew, names: e.crew.members.map((m) => names.get(m) ?? 'chef') } });
      else if (e.type === 'go') this.host.send(e.to, 'k_go', { roomId: e.roomId });
      else this.host.send(e.to, 'sys', { code: e.code });
    }
  }
}
