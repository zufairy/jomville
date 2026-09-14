import { Client, Room } from 'colyseus.js';
import { kitchen } from '@dovey/shared';
import { endpoint } from '../net';
import { deviceToken } from '../identity';
import { Controls, InputClock } from './controls';
import { Interp } from './interp';
import { Predictor } from './predict';
import { KitchenView, applySnap, createView } from './view';
import { useKitchen } from './store';

const CONSENTED = 4000;
const LAG_MS = 250;

/** One cooking round: joins the kitchen room, sends inputs at 30Hz, folds snapshots into a view. */
export class KitchenRound {
  view: KitchenView | null = null;
  me = '';
  names: Record<string, string> = {};
  readonly away = new Set<string>();
  readonly controls = new Controls();
  readonly interp = new Interp();
  predictor: Predictor | null = null;
  /** sounds and shakes for round events (the store gets them too) */
  onEvent: ((e: kitchen.KitchenEvent) => void) | null = null;
  private client = new Client(endpoint());
  private inputClock = new InputClock();

  constructor() {
    this.controls.context = {
      // controls aim from the sim position, never the smoothed display pose
      pose: () => this.predictor?.simPose() ?? null,
      stations: () => this.view?.stations ?? [],
      held: () => this.view?.chefs.find((c) => c.id === this.me)?.held ?? null,
    };
  }

  /** chef ids in join order; entries are never dropped, so per-chef colours stay put */
  roster(): string[] {
    return Object.keys(this.names);
  }
  private room: Room | null = null;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private closed = false;

  async join(roomId: string) {
    const room = await this.client.joinById(roomId, { token: deviceToken() });
    if (this.closed) return void room.leave();
    this.bind(room);
  }

  leave() {
    this.closed = true;
    this.stop();
    this.room?.leave();
    this.room = null;
  }

  private bind(room: Room) {
    this.room = room;
    room.onMessage('k_hello', (m: { you: string; level: string; names: Record<string, string> }) => {
      this.me = m.you;
      this.names = m.names;
      if (!this.view || this.view.level !== m.level) {
        this.view = createView(m.level);
        this.predictor = new Predictor(this.view.solid, this.view.w, this.view.h);
      }
      useKitchen.getState().setPhase('playing');
    });
    room.onMessage('k_roster', (m: { names: Record<string, string> }) => (this.names = m.names));
    room.onMessage('k_snap', (snap: kitchen.KitchenSnap) => this.onSnap(snap));
    room.onMessage('k_event', (e: kitchen.KitchenEvent) => {
      useKitchen.getState().onEvent(e, this.me);
      this.onEvent?.(e);
    });
    room.onMessage('k_result', (r: { score: number; stars: number; served: number; failed: number; earned: number }) => useKitchen.getState().setResult(r));
    room.onMessage('k_away', (m: { id: string; away: boolean }) => (m.away ? this.away.add(m.id) : this.away.delete(m.id)));
    room.onMessage('k_pong', (m: { t: number }) => useKitchen.getState().setLag(performance.now() - m.t > LAG_MS));
    room.onLeave((code) => {
      if (this.room !== room) return;
      this.stop();
      this.room = null;
      if (this.closed || useKitchen.getState().phase === 'results') return;
      if (code === CONSENTED) {
        useKitchen.getState().lost();
        return;
      }
      void this.reconnect(room.reconnectionToken);
    });
    this.stop();
    this.timers.push(setInterval(() => this.sendInput(), 1000 / kitchen.K_TICK_HZ));
    this.timers.push(setInterval(() => this.room?.send('k_ping', { t: performance.now() }), 2000));
  }

  private async reconnect(token: string) {
    useKitchen.getState().setReconnecting(true);
    const until = Date.now() + kitchen.RECONNECT_SECONDS * 1000;
    while (!this.closed && Date.now() < until) {
      try {
        const room = await this.client.reconnect(token);
        if (this.closed) return void room.leave();
        useKitchen.getState().setReconnecting(false);
        this.bind(room);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!this.closed) useKitchen.getState().lost();
  }

  private sendInput() {
    if (!this.room || !this.view || this.view.over) return;
    // a late timer (busy frame, throttled tab) catches up instead of slowing the chef down
    const due = this.inputClock.due(performance.now());
    for (let i = 0; i < due; i++) {
      const inp = this.controls.next();
      this.room.send('k_in', inp);
      this.predictor?.input(inp);
    }
  }

  private onSnap(snap: kitchen.KitchenSnap) {
    const view = this.view;
    if (!view) return;
    const at = performance.now();
    if (!applySnap(view, snap, at)) return;
    this.interp.push(at, snap.chefs);
    const mine = snap.chefs.find((c) => c.id === this.me);
    if (mine) this.predictor?.reconcile(mine, snap.acks[this.me] ?? 0);
    useKitchen.getState().setHud(view);
  }

  private stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
