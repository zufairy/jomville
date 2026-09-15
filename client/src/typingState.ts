/** first "on" goes out after this much continued typing, so a stray key does not flash dots */
export const TYPING_DEBOUNCE_MS = 250;
/** no keystrokes for this long: "off" */
export const TYPING_IDLE_MS = 3000;
/** still typing: repeat "on" this often so the server's 6 s auto-expire never cuts a long message */
export const TYPING_HEARTBEAT_MS = 4000;

/**
 * Local typing state machine: turns input/blur/submit events into rare
 * `typing {on}` sends. Pure: time comes in as arguments; the caller ticks it.
 */
export class TypingSender {
  private on = false;
  private pending = false;
  private pendingSince = 0;
  private lastInput = 0;
  private lastSent = 0;

  constructor(private send: (on: boolean) => void) {}

  /** the input's value changed */
  input(value: string, now: number) {
    if (!value.trim()) return this.stop();
    this.lastInput = now;
    if (!this.on && !this.pending) {
      this.pending = true;
      this.pendingSince = now;
    }
  }

  /** advance timers; returns true while the caller should keep ticking */
  tick(now: number): boolean {
    if (this.pending && now - this.pendingSince >= TYPING_DEBOUNCE_MS) {
      this.pending = false;
      this.on = true;
      this.lastSent = now;
      this.send(true);
    }
    if (this.on) {
      if (now - this.lastInput >= TYPING_IDLE_MS) this.stop();
      else if (now - this.lastSent >= TYPING_HEARTBEAT_MS) {
        this.lastSent = now;
        this.send(true);
      }
    }
    return this.active;
  }

  /** blur, empty, send, disconnect */
  stop() {
    this.pending = false;
    if (!this.on) return;
    this.on = false;
    this.send(false);
  }

  get active(): boolean {
    return this.on || this.pending;
  }
}
